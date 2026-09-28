"""
Flask + Flask-SocketIO сервер.
REST API + live-стриминг валидированных стен (источник данных — Bybit v5).
"""
import asyncio
import logging
import re
import threading
import time
from typing import List, Dict

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit

from anti_spoofing import AntiSpoofingEngine
from config import CONFIG
from data_collector import DataCollector
from database import DB
from liquidation_engine import LiquidationEngine
from liquidation_streamer import LiquidationStreamer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)-12s | %(message)s",
)

# --- фильтр: не логировать запросы /api/icon в access-логе ---
class _IconLogFilter(logging.Filter):
    def filter(self, record):
        try:
            msg = record.getMessage()
            return "/api/icon/" not in msg
        except Exception:
            return True

logging.getLogger("werkzeug").addFilter(_IconLogFilter())

log = logging.getLogger("app")

app = Flask(__name__, static_folder="frontend/dist", static_url_path="")
app.config["SECRET_KEY"] = "hft-heatmap-terminal"
CORS(app)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_interval=20,
    ping_timeout=60,
    max_http_buffer_size=8 * 1024 * 1024,
)

# ------------------------------------------------------------------
# ЯДРО
# ------------------------------------------------------------------
engine = AntiSpoofingEngine(
    min_usd=CONFIG.min_usd,
    min_lifespan=CONFIG.min_lifespan,
)

_active_rooms: set = set()
_active_rooms_lock = threading.Lock()

_state: Dict[str, object] = {
    "symbols": [],
    "started_at": time.time(),
    "last_emit": 0.0,
    "rows_total": 0,
}


def on_snapshot(rows: List[dict]):
    _state["last_emit"] = time.time()
    _state["rows_total"] = len(rows)

    # активные комнаты
    with _active_rooms_lock:
        active = set(_active_rooms)

    if not active:
        # нет слушателей — не тратим CPU
        return

    # фильтруем только нужные символы
    by_symbol: Dict[str, List[dict]] = {}
    for r in rows:
        room = f"sym:{r['symbol']}"
        if room not in active:
            continue
        by_symbol.setdefault(r["symbol"], []).append(r)

    for sym, items in by_symbol.items():
        payload = [{"t": r["t"], "p": r["p"], "u": r["u"],
                    "l": r["l"], "s": r["side"]} for r in items]
        socketio.emit("heatmap:update",
                      {"symbol": sym, "rows": payload},
                      room=f"sym:{sym}")

    # scores раз в 2 сек
    if int(time.time()) % 2 == 0:
        socketio.emit("symbols:scores", build_symbol_scores())


def on_symbols(symbols: List[str]):
    _state["symbols"] = symbols
    socketio.emit("symbols:list", {"symbols": symbols})


def build_symbol_scores() -> List[dict]:
    stats = engine.symbol_stats()
    out = []
    for sym in _state["symbols"] or list(stats.keys()):
        s = stats.get(sym, {"score": 0.0, "walls": 0, "max_wall": 0.0})
        out.append({
            "symbol": sym,
            "score": round(s["score"], 2),
            "walls": s["walls"],
            "max_wall": round(s["max_wall"], 2),
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


# ------------------------------------------------------------------
# ЗАПУСК КОЛЛЕКТОРА В ОТДЕЛЬНОМ ПОТОКЕ
# ------------------------------------------------------------------
def _collector_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    collector = DataCollector(engine, on_snapshot=on_snapshot, on_symbols=on_symbols)
    _state["collector"] = collector
    try:
        loop.run_until_complete(collector.run())
    except Exception:
        log.exception("Коллектор упал")
    finally:
        loop.close()


_COLLECTOR_STARTED = False
_COLLECTOR_LOCK = threading.Lock()


def start_collector():
    global _COLLECTOR_STARTED
    with _COLLECTOR_LOCK:
        if _COLLECTOR_STARTED:
            log.warning("Коллектор уже запущен — пропускаю повторный запуск")
            return None
        _COLLECTOR_STARTED = True
    t = threading.Thread(target=_collector_thread, daemon=True, name="collector")
    t.start()
    log.info("Коллектор запущен (PID потока: %s)", t.ident)
    return t


# ------------------------------------------------------------------
# REST API
# ------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({
        "ok": True,
        "uptime": int(time.time() - _state["started_at"]),
        "symbols": len(_state["symbols"]),
        "active_walls": _state["rows_total"],
        "engine_stats": engine.stats,
        "config": CONFIG.get(),
    })


@app.route("/api/symbols")
def api_symbols():
    scores = build_symbol_scores()
    turnover = getattr(engine, "turnover", {}) or {}
    syms = list(_state.get("symbols", []))
    if turnover:
        syms.sort(key=lambda s: turnover.get(s, 0.0), reverse=True)
    else:
        syms.sort()
    return jsonify({
        "symbols": syms,
        "scores": scores,
    })



@app.route("/api/heatmap/history")
def api_history():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    resolution = request.args.get("resolution", "1m")
    step = request.args.get("step", type=float, default=1.0)
    hours = request.args.get("hours", type=int, default=None)

    res_map = {"1s": 1, "5s": 5, "10s": 10, "30s": 30,
               "1m": 60, "5m": 300, "15m": 900, "1h": 3600}
    res_sec = res_map.get(resolution, 60)

    rows = DB.history(symbol, resolution=res_sec, step=step, hours=hours)
    return jsonify({
        "symbol": symbol,
        "resolution": resolution,
        "step": step,
        "rows": rows,
    })


@app.route("/api/klines")
def api_klines():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    interval = request.args.get("interval", "1m")
    limit = min(int(request.args.get("limit", 1000)), 1000)

    bybit_interval = {
        "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
        "1d": "D", "1w": "W", "1M": "M",
    }.get(interval, "1")

    try:
        r = requests.get(
            "https://api.bybit.com/v5/market/kline",
            params={
                "category": "linear",
                "symbol": symbol,
                "interval": bybit_interval,
                "limit": limit,
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    if data.get("retCode") != 0:
        return jsonify({"error": data.get("retMsg", "bybit error")}), 502

    raw = data["result"]["list"]
    raw.reverse()

    candles = [{
        "time": int(int(k[0]) // 1000),
        "open": float(k[1]),
        "high": float(k[2]),
        "low": float(k[3]),
        "close": float(k[4]),
        "volume": float(k[5]),
    } for k in raw]

    return jsonify({"symbol": symbol, "interval": interval, "candles": candles})


@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    if request.method == "GET":
        return jsonify(CONFIG.get())
    data = request.get_json(force=True, silent=True) or {}
    updated = CONFIG.update(**data)
    engine.configure(min_usd=updated["min_usd"],
                     min_lifespan=updated["min_lifespan"])
    socketio.emit("config:update", updated)
    return jsonify(updated)


# ------------------------------------------------------------------
# SOCKET.IO
# ------------------------------------------------------------------
@socketio.on("connect")
def ws_connect():
    emit("hello", {"ok": True, "ts": int(time.time())})



@socketio.on("disconnect")
def ws_disconnect():
    try:
        from flask import request
        _cleanup_rooms(request.sid)
    except Exception:
        pass


@socketio.on("subscribe")
def ws_subscribe(data):
    sym = (data or {}).get("symbol")
    if not sym:
        return
    prev = (data or {}).get("prev")

    if prev and prev != sym:
        leave_room(f"sym:{prev}")
        with _active_rooms_lock:
            _active_rooms.discard(f"sym:{prev}")

    room = f"sym:{sym}"
    join_room(room)
    with _active_rooms_lock:
        _active_rooms.add(room)

    # мгновенно отдаём текущий снапшот — чтобы не ждать 200 мс
    try:
        now = int(time.time())
        live = [r for r in engine.snapshot(now) if r["symbol"] == sym]
        payload = [{"t": r["t"], "p": r["p"], "u": r["u"],
                    "l": r["l"], "s": r["side"]} for r in live]
        emit("heatmap:update", {"symbol": sym, "rows": payload})
    except Exception as e:
        log.warning("initial snapshot fail: %s", e)

    stats = engine.symbol_stats()
    emit("symbol:stats", {"symbol": sym, "stats": stats.get(sym, {})})


@socketio.on("unsubscribe")
def ws_unsubscribe(data):
    sym = (data or {}).get("symbol")
    if sym:
        leave_room(f"sym:{sym}")




@app.route("/api/walls")
def api_walls():
    """Плотности. Фильтры: min_age (сек) + min_usd (USD)."""
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    min_age = int(request.args.get("min_age", 1800))
    min_usd = float(request.args.get("min_usd", 0))
    now = int(time.time())

    db_rows = DB.long_standing_walls(symbol, min_age_sec=min_age,
                                     activity_window_sec=120)

    live_all = [r for r in engine.snapshot(now) if r["symbol"] == symbol]
    if min_age > 0:
        live = [r for r in live_all if r["l"] >= min_age]
    else:
        live = live_all

    def key_of(side, price):
        return (side, round(float(price), 8))

    seen = set()
    out = []

    for w in db_rows:
        k = key_of(w["side"], w["price"])
        if k in seen:
            continue
        seen.add(k)
        out.append({
            "t": now, "p": w["price"], "u": w["usd"],
            "l": now - w["first_seen"],
            "s": w["side"],
            "src": "db",
        })

    for r in live:
        k = key_of(r["side"], r["p"])
        if k in seen:
            continue
        seen.add(k)
        out.append({
            "t": now, "p": r["p"], "u": r["u"],
            "l": r["l"],
            "s": r["side"],
            "src": "live",
        })

    # фильтр по минимальному объёму (USD)
    if min_usd > 0:
        out = [r for r in out if r["u"] >= min_usd]

    out.sort(key=lambda x: x["u"], reverse=True)
    return jsonify({
        "symbol": symbol,
        "rows": out,
        "ts": now,
        "min_age": min_age,
        "min_usd": min_usd,
        "db_count": len(db_rows),
        "live_count": len(live),
        "live_total": len(live_all),
        "uptime_sec": int(now - _state["started_at"]),
    })





# ------------------------------------------------------------------
# ИКОНКИ МОНЕТ — 12 CDN + дисковый кэш + улучшенная нормализация
# ------------------------------------------------------------------
from functools import lru_cache
from pathlib import Path as _Path

_ICON_CACHE_DIR = _Path("icons_cache")
_ICON_CACHE_DIR.mkdir(exist_ok=True)

# Порядок: сначала проверенные из РФ, потом остальные
_ICON_SOURCES = [
    # --- работает из РФ ---
    ("https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/{c}.svg", "svg"),
    ("https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/{c}.png", "png"),
    ("https://cryptoicons.org/api/color/{c}/200", "png"),
    ("https://assets.coincap.io/assets/icons/{c}@2x.png", "png"),
    ("https://cdn.jsdelivr.net/gh/monzanifabio/cryptofont@master/cryptofont/svg/{c}.svg", "svg"),
    ("https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/128/{c}.png", "png"),
    # --- большие биржевые CDN ---
    ("https://bin.bnbstatic.com/static/assets/logos/{C}.png", "png"),
    ("https://static.okx.com/cdn/oksupport/asset/currency/icon/{c}.png", "png"),
    ("https://assets.coingecko.com/coins/images/{c}/large/{c}.png", "png"),    # редко работает по тикеру
    # --- Bybit (может быть 403) ---
    ("https://s1.bycsi.com/app/assets/img/coin/{c}.svg", "svg"),
    ("https://s1.bycsi.com/app/assets/img/coin/dark/{c}.svg", "svg"),
    ("https://s1.bycsi.com/assets/image/coins/dark/{c}.svg", "svg"),
]

_NORMALIZE_PREFIXES = (
    "1000000000", "100000000", "10000000", "1000000",
    "100000", "10000", "1000", "1M", "1B",
)

# Явные алиасы: Bybit-тикер → нормальное имя на CDN
_ALIASES = {
    "1000pepe": "pepe", "1000shib": "shib", "1000floki": "floki",
    "1000bonk": "bonk", "10000sats": "sats", "1000rats": "rats",
    "1000000babydoge": "babydoge", "1000000mog": "mog",
    "1000btt": "bittorrent", "1000lunc": "terra-luna",
    "1000xec": "ecash", "1000neiro": "neiro",
    "1000neirocto": "neiro", "1000tag": "tag",
    "1000why": "why", "1000cat": "cat", "1000cheems": "cheems",
    "1000sats": "sats", "1000turbo": "turbo", "1000r": "revain",
    "xag": "silver", "xau": "gold", "xpt": "platinum",
    "hyper": "hyperlane", "ton": "toncoin",
    "rndr": "render-token", "render": "render-token",
    "wbtc": "wrapped-bitcoin", "weth": "weth",
    "jup": "jupiter-exchange-solana", "jto": "jito-governance-token",
    "ena": "ethena", "eigen": "eigenlayer",
    "ondo": "ondo-finance", "sui": "sui",
    "apt": "aptos", "arb": "arbitrum", "op": "optimism",
    "imx": "immutable-x", "sei": "sei-network",
    "tia": "celestia", "inj": "injective-protocol",
    "stx": "blockstack", "ftm": "fantom",
    "matic": "polygon-ecosystem-token", "pol": "polygon-ecosystem-token",
    "avax": "avalanche-2", "doge": "dogecoin",
    "atom": "cosmos", "near": "near",
    "fil": "filecoin", "ldo": "lido-dao",
    "crv": "curve-dao-token", "aave": "aave",
    "sand": "the-sandbox", "mana": "decentraland",
    "gala": "gala", "ape": "apecoin",
    "flow": "flow", "chz": "chiliz",
    "one": "harmony", "waves": "waves",
    "cake": "pancakeswap-token", "1inch": "1inch",
}

# Убираем числовой суффикс типа "LUNA2" → "luna"
_SUFFIX_RE = re.compile(r'^(.*?)([0-9])+$')


def _is_valid_image(data: bytes):
    if not data or len(data) < 64:
        return None
    head = data[:512].lstrip()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:2048]):
        return "image/svg+xml"
    if len(data) >= 8 and data[0] == 0x89 and data[1] == 0x50 and data[2] == 0x4E and data[3] == 0x47 \
       and data[4] == 0x0D and data[5] == 0x0A and data[6] == 0x1A and data[7] == 0x0A:
        return "image/png"
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[0:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if len(data) >= 3 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF:
        return "image/jpeg"
    return None


def _icon_candidates(coin: str):
    """Многоуровневая нормализация тикера."""
    base = coin.upper().strip()
    variants = [base]

    # убираем известные префиксы-множители
    for p in _NORMALIZE_PREFIXES:
        if base.startswith(p) and len(base) > len(p):
            variants.append(base[len(p):])

    # убираем USDT
    for v in list(variants):
        if v.endswith("USDT"):
            variants.append(v[:-4])

    # убираем цифры в конце (LUNA2 → LUNA)
    for v in list(variants):
        m = _SUFFIX_RE.match(v)
        if m and m.group(1) and len(m.group(1)) >= 2:
            variants.append(m.group(1))

    # алиасы + lowercase + дедуп
    out, seen = [], set()
    for v in variants:
        low = v.lower()
        low = _ALIASES.get(low, low)
        if low and low not in seen:
            seen.add(low)
            out.append(low)
    return out


def _cache_path(coin: str):
    coin = coin.upper()
    for ext, ctype in (("svg", "image/svg+xml"), ("png", "image/png"),
                       ("webp", "image/webp"), ("gif", "image/gif"),
                       ("jpg", "image/jpeg"), ("miss", None)):
        p = _ICON_CACHE_DIR / f"{coin}.{ext}"
        if p.exists():
            if ext == "miss":
                return "MISS", None
            return p.read_bytes(), ctype
    return None, None


def _cache_save(coin: str, data: bytes, ctype: str):
    ext_map = {
        "image/svg+xml": "svg", "image/png": "png",
        "image/webp": "webp", "image/gif": "gif", "image/jpeg": "jpg",
    }
    (_ICON_CACHE_DIR / f"{coin.upper()}.{ext_map.get(ctype, 'bin')}").write_bytes(data)


def _cache_save_miss(coin: str):
    (_ICON_CACHE_DIR / f"{coin.upper()}.miss").write_bytes(b"")


@lru_cache(maxsize=8192)
def _fetch_icon(coin: str):
    coin = (coin or "").upper().strip()
    if not coin or len(coin) > 24 or not coin.isalnum():
        return None

    cached, ctype = _cache_path(coin)
    if cached == "MISS":
        return None
    if cached:
        return cached, ctype

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept": "image/svg+xml,image/png,image/webp,image/*,*/*;q=0.8",
    }

    for variant in _icon_candidates(coin):
        for tpl, _hint in _ICON_SOURCES:
            url = tpl.format(c=variant, C=variant.upper())
            try:
                r = requests.get(url, timeout=3, headers=headers, allow_redirects=True)
                if r.status_code != 200 or not r.content:
                    continue
                ct = _is_valid_image(r.content)
                if ct:
                    _cache_save(coin, r.content, ct)
                    return r.content, ct
            except Exception:
                continue

    _cache_save_miss(coin)
    return None


@app.route("/api/icon/<coin>")
def api_icon(coin: str):
    got = _fetch_icon(coin)
    if not got:
        return ("", 404)
    body, ctype = got
    resp = app.response_class(body, mimetype=ctype)
    resp.headers["Cache-Control"] = "public, max-age=604800"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/api/icon_stats")
def api_icon_stats():
    """Сколько иконок в кэше (svg/png/miss)."""
    files = list(_ICON_CACHE_DIR.glob("*"))
    ok = sum(1 for f in files if f.suffix in (".svg", ".png", ".webp", ".gif", ".jpg"))
    miss = sum(1 for f in files if f.suffix == ".miss")
    return jsonify({"ok": ok, "miss": miss, "total": ok + miss, "cache_dir": str(_ICON_CACHE_DIR)})


@app.route("/api/icon_miss_list")
def api_icon_miss_list():
    """Список монет, для которых иконки не нашлись."""
    misses = sorted(f.stem for f in _ICON_CACHE_DIR.glob("*.miss"))
    return jsonify({"count": len(misses), "coins": misses})


@app.route("/api/icon_debug/<coin>")
def api_icon_debug(coin: str):
    coin = coin.upper()
    variants = _icon_candidates(coin)
    headers = {"User-Agent": "Mozilla/5.0"}
    results = []
    for variant in variants:
        for tpl, _hint in _ICON_SOURCES:
            url = tpl.format(c=variant, C=variant.upper())
            e = {"variant": variant, "url": url}
            try:
                r = requests.get(url, timeout=4, headers=headers, allow_redirects=True)
                e["status"] = r.status_code
                e["valid"] = bool(_is_valid_image(r.content)) if r.status_code == 200 else False
            except Exception as ex:
                e["error"] = str(ex)[:60]
            results.append(e)
    return jsonify({"coin": coin, "variants": variants, "results": results})


@app.route("/api/icon_clearcache")
def api_icon_clearcache():
    import shutil
    if _ICON_CACHE_DIR.exists():
        shutil.rmtree(_ICON_CACHE_DIR)
    _ICON_CACHE_DIR.mkdir(exist_ok=True)
    _fetch_icon.cache_clear()
    return jsonify({"ok": True})


@app.route("/api/wall_history")
def api_wall_history():
    """
    История конкретной стены (symbol, side, price) за N минут.
    Возвращает точки [{'t': unix, 'u': usd}], min/max/avg, кол-во точек.
    """
    symbol = request.args.get("symbol", "").upper()
    side = request.args.get("side", "bid").lower()
    try:
        price = float(request.args.get("price", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "bad price"}), 400
    minutes = int(request.args.get("minutes", 60))
    minutes = max(5, min(minutes, 1440))

    now = int(time.time())
    since = now - minutes * 60

    # относительный допуск: 0.05% от цены (или 1e-6 для мелких монет)
    tol = max(abs(price) * 0.0005, 1e-8)

    conn = DB._conn()
    cur = conn.execute(
        """
        SELECT timestamp, MAX(usd_value) AS u, MAX(lifespan) AS l
        FROM heatmap
        WHERE symbol = ?
          AND side = ?
          AND ABS(CAST(price AS REAL) - ?) < ?
          AND timestamp >= ?
        GROUP BY timestamp
        ORDER BY timestamp ASC
        """,
        (symbol, side, price, tol, since),
    )
    points = []
    for t, u, l in cur.fetchall():
        points.append({"t": int(t), "u": float(u or 0), "l": float(l or 0)})

    usd_vals = [p["u"] for p in points]
    stats = {
        "count": len(points),
        "min": min(usd_vals) if usd_vals else 0,
        "max": max(usd_vals) if usd_vals else 0,
        "avg": sum(usd_vals) / len(usd_vals) if usd_vals else 0,
        "first_t": points[0]["t"] if points else now,
        "last_t":  points[-1]["t"] if points else now,
    }

    return jsonify({
        "symbol": symbol,
        "side": side,
        "price": price,
        "minutes": minutes,
        "points": points,
        "stats": stats,
    })



@app.route("/api/last_candle")
def api_last_candle():
    """Отдаёт только последние 2 свечи для live-обновления графика."""
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    interval = request.args.get("interval", "1m")

    bybit_interval = {
        "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
        "1d": "D", "1w": "W", "1M": "M",
    }.get(interval, "1")

    try:
        r = requests.get(
            "https://api.bybit.com/v5/market/kline",
            params={"category": "linear", "symbol": symbol,
                    "interval": bybit_interval, "limit": 3},
            timeout=5,
        )
        data = r.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    if data.get("retCode") != 0:
        return jsonify({"error": data.get("retMsg", "bybit error")}), 502

    raw = data["result"]["list"]
    raw.reverse()

    candles = [{
        "time": int(int(k[0]) // 1000),
        "open": float(k[1]),
        "high": float(k[2]),
        "low": float(k[3]),
        "close": float(k[4]),
        "volume": float(k[5]),
    } for k in raw]

    return jsonify({"symbol": symbol, "candles": candles})




def _cleanup_rooms(sid):
    """Убирает все комнаты данного sid из активных."""
    try:
        from flask import request
        # получаем комнаты через socketio server
        mgr = socketio.server.manager
        rooms_map = mgr.rooms.get('/', {})
        # собираем все комнаты, в которых есть sid
        my_rooms = []
        for r, sids in rooms_map.items():
            if sid in sids:
                my_rooms.append(r)
        with _active_rooms_lock:
            for r in my_rooms:
                if r.startswith("sym:"):
                    # если sid был единственным в комнате — удаляем
                    if len(rooms_map.get(r, set())) <= 1:
                        _active_rooms.discard(r)
    except Exception:
        pass

@app.route("/api/ticker_info")
def api_ticker_info():
    """24h статистика по символу: high, low, volume, turnover, funding."""
    symbol = request.args.get("symbol", "BTCUSDT").upper()

    # кэш на 10 сек (чтобы не долбить Bybit)
    now = time.time()
    cache_key = f"ticker:{symbol}"
    cached = _state.get(cache_key)
    if cached and (now - cached["ts"]) < 10:
        return jsonify(cached["data"])

    try:
        r = requests.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": symbol},
            timeout=6,
        )
        data = r.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    if data.get("retCode") != 0:
        return jsonify({"error": data.get("retMsg", "bybit error")}), 502

    items = data.get("result", {}).get("list", [])
    if not items:
        return jsonify({"error": "no data"}), 404

    t = items[0]
    def f(v):
        try: return float(v or 0)
        except: return 0.0

    out = {
        "symbol": symbol,
        "price": f(t.get("lastPrice")),
        "high24h": f(t.get("highPrice24h")),
        "low24h": f(t.get("lowPrice24h")),
        "volume24h": f(t.get("volume24h")),         # в базовой монете
        "turnover24h": f(t.get("turnover24h")),     # в USD
        "fundingRate": f(t.get("fundingRate")),
        "nextFundingTime": int(t.get("nextFundingTime") or 0) // 1000,
        "openInterest": f(t.get("openInterest")),
        "openInterestValue": f(t.get("openInterestValue")),
        "prevPrice24h": f(t.get("prevPrice24h")),
        "priceChangePct": f(t.get("price24hPcnt")) * 100,
    }

    _state[cache_key] = {"ts": now, "data": out}
    return jsonify(out)


@app.route("/api/scanner")
def api_scanner():
    """
    Сканер пампов и дампов. Всегда возвращает валидный JSON.
    Параметры: period (1m-24h), min_pct (число), direction (all|up|down)
    """
    try:
        import math
        from concurrent.futures import ThreadPoolExecutor, as_completed

        period = request.args.get("period", "24h")
        try:
            min_pct = float(request.args.get("min_pct", 0))
        except (TypeError, ValueError):
            min_pct = 0
        direction = request.args.get("direction", "all")

        interval_map = {
            "1m": "1", "5m": "5", "15m": "15", "30m": "30",
            "1h": "60", "4h": "240",
        }

        now = time.time()
        cache_key = f"scanner:{period}:{min_pct}:{direction}"
        cached = _state.get(cache_key)
        ttl = 2 if period == "24h" else 15
        if cached and (now - cached["ts"]) < ttl:
            return jsonify(cached["data"])

        # 1) получить все тикеры
        try:
            r = requests.get(
                "https://api.bybit.com/v5/market/tickers",
                params={"category": "linear"},
                timeout=10,
            )
            data = r.json()
        except Exception as e:
            log.exception("scanner: bybit tickers")
            return jsonify({"error": "bybit: " + str(e), "coins": [], "total": 0, "period": period})

        if not isinstance(data, dict) or data.get("retCode") != 0:
            return jsonify({"error": "bybit response bad", "coins": [], "total": 0, "period": period})

        items = data.get("result", {}).get("list", []) or []

        def fnum(v, d=0.0):
            try:
                return float(v) if v not in (None, "") else d
            except (TypeError, ValueError):
                return d

        base = []
        for t in items:
            if not isinstance(t, dict):
                continue
            sym = t.get("symbol", "")
            if not sym.endswith("USDT"):
                continue
            last = fnum(t.get("lastPrice"))
            turn = fnum(t.get("turnover24h"))
            if last <= 0 or turn < 100_000:
                continue
            base.append({
                "symbol": sym,
                "price": last,
                "high24h": fnum(t.get("highPrice24h")),
                "low24h": fnum(t.get("lowPrice24h")),
                "turnover24h": turn,
                "volume24h": fnum(t.get("volume24h")),
                "funding": fnum(t.get("fundingRate")) * 100,
                "oi": fnum(t.get("openInterestValue")),
                "change24h": fnum(t.get("price24hPcnt")) * 100,
            })

        # 2) % за период
        if period == "24h":
            for c in base:
                c["change"] = c["change24h"]
        else:
            interval = interval_map.get(period, "5")
            base.sort(key=lambda c: c["turnover24h"], reverse=True)
            candidates = base[:50]

            def fetch_change(c):
                try:
                    r = requests.get(
                        "https://api.bybit.com/v5/market/kline",
                        params={
                            "category": "linear",
                            "symbol": c["symbol"],
                            "interval": interval,
                            "limit": 2,
                        },
                        timeout=3,
                    )
                    d = r.json()
                    if not isinstance(d, dict) or d.get("retCode") != 0:
                        return
                    kl = d.get("result", {}).get("list") or []
                    if len(kl) < 2:
                        return
                    op = float(kl[1][1])
                    cl = float(kl[0][4])
                    if op > 0:
                        c["change"] = (cl - op) / op * 100
                except Exception:
                    pass

            with ThreadPoolExecutor(max_workers=30) as pool:
                futs = [pool.submit(fetch_change, c) for c in candidates]
                for _ in as_completed(futs):
                    pass

            base = [c for c in base if "change" in c]

        # 3) фильтр
        if direction == "up":
            base = [c for c in base if c.get("change", 0) > 0]
        elif direction == "down":
            base = [c for c in base if c.get("change", 0) < 0]
        base = [c for c in base if abs(c.get("change", 0)) >= min_pct]

        # 4) score
        for c in base:
            tn = math.log10(c["turnover24h"] + 1) if c["turnover24h"] > 0 else 0
            c["score"] = c["change"] * tn * 0.6 + abs(c["funding"]) * 1.5

        base.sort(key=lambda c: abs(c["change"]), reverse=True)

        out = {
            "ts": int(now),
            "period": period,
            "direction": direction,
            "min_pct": min_pct,
            "total": len(base),
            "coins": base[:150],
        }
        _state[cache_key] = {"ts": now, "data": out}
        return jsonify(out)

    except Exception as e:
        log.exception("scanner fatal")
        return jsonify({"error": "fatal: " + str(e), "coins": [], "total": 0})



@app.route("/api/ta_analysis")
def api_ta_analysis():
    """Технический анализ по монете."""
    try:
        from ta_engine import analyze_candles

        symbol = request.args.get("symbol", "BTCUSDT").upper()
        interval = request.args.get("interval", "1h")
        try:
            limit = min(int(request.args.get("limit", 200)), 500)
        except (TypeError, ValueError):
            limit = 200

        interval_map = {
            "1m": "1", "5m": "5", "15m": "15", "30m": "30",
            "1h": "60", "4h": "240", "1d": "D",
        }
        bybit_interval = interval_map.get(interval, "60")

        r = requests.get(
            "https://api.bybit.com/v5/market/kline",
            params={
                "category": "linear",
                "symbol": symbol,
                "interval": bybit_interval,
                "limit": limit,
            },
            timeout=10,
        )
        data = r.json()
        if not isinstance(data, dict) or data.get("retCode") != 0:
            return jsonify({"error": "bybit: bad response", "symbol": symbol})

        raw = data.get("result", {}).get("list") or []
        raw.reverse()
        candles = []
        for k in raw:
            try:
                candles.append({
                    "time": int(int(k[0]) // 1000),
                    "open": float(k[1]),
                    "high": float(k[2]),
                    "low": float(k[3]),
                    "close": float(k[4]),
                    "volume": float(k[5]),
                })
            except Exception:
                continue

        if len(candles) < 30:
            return jsonify({"error": "мало данных", "symbol": symbol})

        result = analyze_candles(candles)
        result["symbol"] = symbol
        result["interval"] = interval
        return jsonify(result)
    except Exception as e:
        log.exception("ta_analysis")
        return jsonify({"error": "fatal: " + str(e)[:200]})




# ------------------------------------------------------------------
# LIQUIDATIONS
# ------------------------------------------------------------------
_liq_engine = LiquidationEngine()


def on_liquidation(ev):
    _liq_engine.add(ev)


def _liq_thread():
    import asyncio as _asyncio
    async def main():
        # ждём пока collector загрузит символы
        while not _state.get("symbols"):
            await _asyncio.sleep(1)
        streamer = LiquidationStreamer(list(_state["symbols"]), on_liquidation)
        await streamer.run()

    loop = _asyncio.new_event_loop()
    _asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(main())
    except Exception:
        log.exception("liq thread")
    finally:
        loop.close()


def start_liq_streamer():
    t = threading.Thread(target=_liq_thread, daemon=True, name="liq-streamer")
    t.start()
    return t


@app.route("/api/liquidations/live")
def api_liquidations_live():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    limit = min(int(request.args.get("limit", 100)), 500)
    min_usd = float(request.args.get("min_usd", 0))
    rows = _liq_engine.live(symbol, limit=limit)
    if min_usd > 0:
        rows = [r for r in rows if r["usd"] >= min_usd]
    return jsonify({"symbol": symbol, "events": rows})


@app.route("/api/liquidations/top")
def api_liquidations_top():
    window = request.args.get("window", "1h")
    min_usd = float(request.args.get("min_usd", 10000))
    limit = min(int(request.args.get("limit", 30)), 100)
    win_map = {"1h": 3600, "4h": 14400, "12h": 43200, "24h": 86400}
    window_sec = win_map.get(window, 3600)
    return jsonify({"window": window, "coins": _liq_engine.top(window_sec, min_usd, limit)})


@app.route("/api/liquidations/stats")
def api_liquidations_stats():
    return jsonify({"engine": _liq_engine.stats})


# ------------------------------------------------------------------
# STATIC (SPA)
# ------------------------------------------------------------------
@app.route("/")
def index():
    try:
        return send_from_directory(app.static_folder, "index.html")
    except Exception:
        return ("Frontend не собран. Выполните `npm run build` в папке frontend.",
                200)


# ------------------------------------------------------------------
if __name__ == "__main__":
    start_collector()
    log.info("Сервер запущен на http://0.0.0.0:5050")
    socketio.run(app, host="0.0.0.0", port=5050,
                 allow_unsafe_werkzeug=True, log_output=False)