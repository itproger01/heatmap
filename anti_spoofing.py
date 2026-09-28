"""
Stateful anti-spoofing engine.

Логика:
  1. Любой уровень с (price * qty) < min_usd — игнорируется.
  2. Уровень попадает в _tracked. Если он исчезает/уменьшается раньше
     min_lifespan секунд — это спуфер, полностью удаляем.
  3. Если уровень выжил min_lifespan — он переезжает в _approved,
     считается "настоящей плотностной стеной" и попадает в тепловую карту.
"""
import time
import threading
from typing import Dict, Tuple, List, Any

Key = Tuple[str, str, float]  # (symbol, side, price)


class AntiSpoofingEngine:
    def __init__(self, min_usd: float = 100_000.0, min_lifespan: float = 5.0,
                 stale_ttl: float = 180.0):
        self.min_usd = min_usd
        self.min_lifespan = min_lifespan
        self.stale_ttl = stale_ttl

        self._lock = threading.RLock()
        self._tracked: Dict[Key, dict] = {}
        self._approved: Dict[Key, dict] = {}

        # оборот по символу (24h, USD) — для адаптивного порога
        self.turnover: Dict[str, float] = {}
        # метрики
        self.stats = {
            "seen": 0,
            "rejected_small": 0,
            "spoofed": 0,
            "approved": 0,
        }

    # ------------------------------------------------------------
    def set_turnover_map(self, mapping: Dict[str, float]):
        """Устанавливает обороты по символам (24h USD)."""
        with self._lock:
            self.turnover = dict(mapping or {})

    # ------------------------------------------------------------
    def threshold_for(self, symbol: str) -> float:
        """
        Адаптивный порог по обороту монеты.
        Мелкие альты: $3k; BTC/ETH: $100k.
        """
        turn = self.turnover.get(symbol, 0.0)
        base = float(self.min_usd)
        if turn >= 1_000_000_000:      # > $1B — BTC, ETH, SOL
            mult = 1.0
        elif turn >= 100_000_000:      # > $100M — XRP, DOGE, ADA
            mult = 0.5
        elif turn >= 10_000_000:       # > $10M — средние альты
            mult = 0.2
        elif turn >= 1_000_000:        # > $1M
            mult = 0.08
        else:                          # < $1M — мелкие
            mult = 0.03
        # floor — чтобы совсем мусор не проходил
        return max(1_500.0, base * mult)

    # ------------------------------------------------------------
    def configure(self, min_usd: float = None, min_lifespan: float = None):
        with self._lock:
            if min_usd is not None:
                self.min_usd = float(min_usd)
            if min_lifespan is not None:
                self.min_lifespan = float(min_lifespan)

    # ------------------------------------------------------------
    def on_book_update(self, symbol: str, price: float, qty: float, side: str):
        """Вызывается на каждое изменение уровня в L2-стакане."""
        now = time.time()
        key: Key = (symbol, side, price)
        usd = price * qty

        with self._lock:
            self.stats["seen"] += 1

            # --- отсев мелочи и явных удалений ---
            threshold = self.threshold_for(symbol)
            if qty <= 0.0 or usd < threshold:
                if usd < threshold and qty > 0:
                    self.stats["rejected_small"] += 1
                was_tracked = self._tracked.pop(key, None)
                self._approved.pop(key, None)
                if was_tracked is not None:
                    age = now - was_tracked["first_seen"]
                    if age < self.min_lifespan:
                        # мгновенно исчез — спуф
                        self.stats["spoofed"] += 1
                return

            # --- уже подтверждённый уровень ---
            rec = self._approved.get(key)
            if rec is not None:
                rec["usd"] = usd
                rec["last_seen"] = now
                return

            # --- новый / обновляемый кандидат ---
            rec = self._tracked.get(key)
            if rec is None:
                self._tracked[key] = {
                    "symbol": symbol,
                    "side": side,
                    "price": price,
                    "usd": usd,
                    "first_seen": now,
                    "last_seen": now,
                }
            else:
                rec["usd"] = usd
                rec["last_seen"] = now

    # ------------------------------------------------------------
    def sweep(self, now: float = None) -> int:
        """Промоутит выжившие уровни и вычищает протухшие."""
        now = now or time.time()
        promoted = 0
        with self._lock:
            for key, rec in list(self._tracked.items()):
                if now - rec["first_seen"] >= self.min_lifespan:
                    self._approved[key] = rec
                    del self._tracked[key]
                    promoted += 1
                    self.stats["approved"] += 1

            for key, rec in list(self._approved.items()):
                if now - rec["last_seen"] > self.stale_ttl:
                    del self._approved[key]
        return promoted

    # ------------------------------------------------------------
    def snapshot(self, now: float = None) -> List[dict]:
        """Возвращает все подтверждённые стены с их жизненным циклом."""
        now = now or time.time()
        out: List[dict] = []
        with self._lock:
            for key, rec in self._approved.items():
                symbol, side, price = key
                out.append({
                    "symbol": symbol,
                    "side": side,
                    "t": int(now),
                    "p": price,
                    "u": rec["usd"],
                    "l": now - rec["first_seen"],
                })
        return out

    # ------------------------------------------------------------
    def symbol_stats(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            out: Dict[str, Dict[str, Any]] = {}
            for (symbol, _side, _price), rec in self._approved.items():
                s = out.setdefault(symbol, {"score": 0.0, "walls": 0, "max_wall": 0.0})
                s["score"] += rec["usd"]
                s["walls"] += 1
                if rec["usd"] > s["max_wall"]:
                    s["max_wall"] = rec["usd"]
            return out

    # ------------------------------------------------------------
    def clear(self):
        with self._lock:
            self._tracked.clear()
            self._approved.clear()
