"""
Асинхронный мультиплексор L2-данных Bybit v5 (USDT-perp).
- Находит топ-200 USDT-перпетуалов по 24h turnover.
- Делит на группы по 30 символов → ~7 WS-соединений.
- Bybit шлёт snapshot сам при подписке, потом delta — REST не нужен.
- Прогоняет изменения через AntiSpoofingEngine.
"""
import asyncio
import logging
import time
from typing import Callable, Dict, List, Optional

import aiohttp
import orjson
import websockets

from anti_spoofing import AntiSpoofingEngine
from config import CONFIG

log = logging.getLogger("collector")

BYBIT_REST = "https://api.bybit.com"
BYBIT_WS = "wss://stream.bybit.com/v5/public/linear"
GROUP_SIZE = 50
DEPTH = 50
SUB_BATCH = 10


class LocalOrderBook:
    __slots__ = ("symbol", "bids", "asks", "ready")

    def __init__(self, symbol: str):
        self.symbol = symbol
        self.bids: Dict[float, float] = {}
        self.asks: Dict[float, float] = {}
        self.ready = False

    def apply_snapshot(self, data: dict):
        self.bids = {float(p): float(q) for p, q in data.get("b", [])}
        self.asks = {float(p): float(q) for p, q in data.get("a", [])}
        self.ready = True

    def apply_delta(self, data: dict):
        changes = []
        for p, q in data.get("b", []):
            price = float(p); qty = float(q)
            if qty == 0.0:
                self.bids.pop(price, None)
            else:
                self.bids[price] = qty
            changes.append(("bid", price, qty))
        for p, q in data.get("a", []):
            price = float(p); qty = float(q)
            if qty == 0.0:
                self.asks.pop(price, None)
            else:
                self.asks[price] = qty
            changes.append(("ask", price, qty))
        return changes


class DataCollector:
    def __init__(self, engine: AntiSpoofingEngine,
                 on_snapshot: Callable[[List[dict]], None],
                 on_symbols: Callable[[List[str]], None] = None):
        self.engine = engine
        self.on_snapshot = on_snapshot
        self.on_symbols = on_symbols
        self.books: Dict[str, LocalOrderBook] = {}
        self.symbols: List[str] = []
        self._stop = asyncio.Event()
        self._session: Optional[aiohttp.ClientSession] = None

    async def run(self):
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={"User-Agent": "heatmap-terminal/1.0"},
        )
        try:
            self.symbols = await self._fetch_all_symbols()
            log.info("Найдено %d символов", len(self.symbols))

            # обороты для адаптивного порога
            turnover = await self._fetch_turnover_map()
            try:
                self.engine.set_turnover_map(turnover)
                log.info("Движок получил обороты по %d символам", len(turnover))
            except AttributeError:
                log.warning("engine.set_turnover_map недоступен")


            if turnover:
                self.symbols.sort(key=lambda s: turnover.get(s, 0.0), reverse=True)
            # СОРТИРУЕМ символы по 24h обороту (убывание)
            if turnover:
                self.symbols.sort(
                    key=lambda s: turnover.get(s, 0.0),
                    reverse=True,
                )
                log.info("Символы отсортированы по обороту. ТОП-10: %s",
                         [s for s in self.symbols[:10]])

            if self.on_symbols:
                self.on_symbols(self.symbols)

            for s in self.symbols:
                self.books[s] = LocalOrderBook(s)

            groups = [self.symbols[i:i + GROUP_SIZE]
                      for i in range(0, len(self.symbols), GROUP_SIZE)]
            log.info("Запускаю %d WS-групп", len(groups))

            tasks = [asyncio.create_task(self._group_worker(g)) for g in groups]
            tasks.append(asyncio.create_task(self._sampler_loop()))
            await asyncio.gather(*tasks)
        finally:
            await self._session.close()

    def stop(self):
        self._stop.set()

    async def _fetch_all_symbols(self) -> List[str]:
        """
        Загружает ВСЕ USDT-перпетуалы Bybit (category=linear).
        С логированием каждого этапа для отладки.
        """
        url = f"{BYBIT_REST}/v5/market/instruments-info"
        symbols: List[str] = []
        cursor = None
        page = 0
        raw_total = 0
        statuses = {}
        contracts = {}

        while True:
            page += 1
            if page > 20:
                break
            params = {"category": "linear", "limit": 1000}
            if cursor:
                params["cursor"] = cursor

            async with self._session.get(url, params=params) as r:
                raw = await r.read()
            data = orjson.loads(raw)

            if not isinstance(data, dict) or data.get("retCode") != 0:
                log.error("Bybit instruments-info fail: %s", str(data)[:500])
                raise RuntimeError(f"Bybit instruments fail: {str(data)[:300]}")

            result = data.get("result") or {}
            items = result.get("list") or []
            raw_total += len(items)

            for item in items:
                sym = item.get("symbol", "")
                quote = item.get("quoteCoin", "")
                status = item.get("status", "")
                ctype = item.get("contractType", "")
                statuses[status] = statuses.get(status, 0) + 1
                contracts[ctype] = contracts.get(ctype, 0) + 1

                # мягкий фильтр: только USDT + линейные
                if not sym.endswith("USDT"):
                    continue
                if quote and quote != "USDT":
                    continue
                if ctype and "Linear" not in ctype:
                    continue
                # status допускаем любой, кроме явно запрещённых
                if status in ("Closed", "Delivering", "PreLaunch"):
                    continue
                symbols.append(sym)

            cursor = result.get("nextPageCursor")
            log.info("Bybit page %d: items=%d, total_acc=%d, cursor=%s",
                     page, len(items), len(symbols), "yes" if cursor else "no")
            if not cursor:
                break

        log.info("Bybit raw items: %d, statuses: %s", raw_total, statuses)
        log.info("Bybit contractTypes: %s", contracts)

        symbols = sorted(set(symbols))
        log.info("Bybit: итоговый список = %d символов", len(symbols))
        if symbols[:5]:
            log.info("Bybit примеры: %s", symbols[:5])
        return symbols


    async def _fetch_turnover_map(self) -> Dict[str, float]:
        """24h оборот по каждому USDT-перпу — для адаптивного порога."""
        url = f"{BYBIT_REST}/v5/market/tickers"
        params = {"category": "linear"}
        try:
            async with self._session.get(url, params=params) as r:
                raw = await r.read()
            data = orjson.loads(raw)
            if not isinstance(data, dict) or data.get("retCode") != 0:
                log.warning("turnover fetch fail: %s", str(data)[:200])
                return {}
            out: Dict[str, float] = {}
            for d in data["result"]["list"]:
                sym = d.get("symbol", "")
                if not sym:
                    continue
                try:
                    out[sym] = float(d.get("turnover24h") or 0)
                except (TypeError, ValueError):
                    pass
            log.info("turnover map: %d символов", len(out))
            return out
        except Exception as e:
            log.warning("turnover exception: %s", e)
            return {}

    async def _group_worker(self, group: List[str]):
        args = [f"orderbook.{DEPTH}.{s}" for s in group]
        backoff = 1.0

        while not self._stop.is_set():
            try:
                async with websockets.connect(
                    BYBIT_WS,
                    ping_interval=20,
                    ping_timeout=30,
                    max_size=2 ** 24,
                    close_timeout=5,
                ) as ws:
                    log.info("WS подключён (%d символов)", len(group))
                    backoff = 1.0

                    for i in range(0, len(args), SUB_BATCH):
                        batch = args[i:i + SUB_BATCH]
                        await ws.send(orjson.dumps({
                            "op": "subscribe",
                            "args": batch,
                        }).decode())
                        await asyncio.sleep(0.05)

                    async for raw in ws:
                        if self._stop.is_set():
                            break
                        try:
                            msg = orjson.loads(raw)
                        except Exception:
                            continue

                        topic = msg.get("topic")
                        if not topic or not topic.startswith("orderbook."):
                            continue

                        typ = msg.get("type")
                        data = msg.get("data") or {}
                        sym = data.get("s")
                        if not sym:
                            continue
                        book = self.books.get(sym)
                        if book is None:
                            continue

                        if typ == "snapshot":
                            book.apply_snapshot(data)
                            for side, price, qty in self._iter_levels(data):
                                self.engine.on_book_update(sym, price, qty, side)
                        elif typ == "delta":
                            if not book.ready:
                                continue
                            for side, price, qty in book.apply_delta(data):
                                self.engine.on_book_update(sym, price, qty, side)

            except asyncio.CancelledError:
                return
            except Exception as e:
                log.warning("WS группа упала: %s — реконнект через %.1fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 60.0)

    @staticmethod
    def _iter_levels(data: dict):
        for p, q in data.get("b", []):
            yield ("bid", float(p), float(q))
        for p, q in data.get("a", []):
            yield ("ask", float(p), float(q))

    async def _sampler_loop(self):
        from database import DB
        last_emit = 0.0
        last_db = 0.0

        while not self._stop.is_set():
            await asyncio.sleep(0.2)
            now = time.time()
            eng = self.engine
            eng.sweep(now)
            eng.configure(min_usd=CONFIG.min_usd, min_lifespan=CONFIG.min_lifespan)

            if now - last_emit >= CONFIG.emit_interval:
                last_emit = now
                rows = eng.snapshot(now)
                try:
                    self.on_snapshot(rows)
                except Exception as e:
                    log.exception("on_snapshot fail: %s", e)

                if now - last_db >= CONFIG.db_interval:
                    last_db = now
                    db_rows = self._prepare_db_rows(rows, now)
                    if db_rows:
                        DB.enqueue(db_rows)
                    DB.update_symbol_stats(eng.symbol_stats())

    def _prepare_db_rows(self, rows, now):
        by_symbol: Dict[str, List[dict]] = {}
        for r in rows:
            if r["u"] < CONFIG.persist_min_usd:
                continue
            # Persist только стен, живущих > 2 минут (иначе БД распухает от спуферов)
            if r["l"] < 60:
                continue
            by_symbol.setdefault(r["symbol"], []).append(r)
        out = []
        limit = CONFIG.max_levels_per_symbol
        ts = int(now)
        for sym, lst in by_symbol.items():
            lst.sort(key=lambda x: x["u"], reverse=True)
            for r in lst[:limit]:
                out.append((sym, ts, float(r["p"]), float(r["u"]),
                            float(r["l"]), r["side"]))
        return out