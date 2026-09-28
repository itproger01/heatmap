"""Движок ликвидаций: буфер + агрегация."""
import threading
import time
from collections import deque
from typing import Dict, List


class LiquidationEngine:
    def __init__(self, ring_size: int = 50000):
        self._lock = threading.RLock()
        self._ring = deque(maxlen=ring_size)
        self.stats = {"seen": 0, "big": 0, "total_usd": 0.0}

    def add(self, ev: dict):
        with self._lock:
            self._ring.append(ev)
            self.stats["seen"] += 1
            self.stats["total_usd"] += ev.get("usd", 0)
            if ev.get("usd", 0) >= 500_000:
                self.stats["big"] += 1

    def live(self, symbol: str, limit: int = 100) -> List[dict]:
        with self._lock:
            out = [e for e in self._ring if e["symbol"] == symbol]
            out = out[-limit:]
            out.reverse()
            return out

    def top(self, window_sec: int, min_usd: float, limit: int = 30) -> List[dict]:
        with self._lock:
            now = int(time.time())
            since = now - window_sec
            by_symbol: Dict[str, dict] = {}
            for e in self._ring:
                if e["ts"] < since or e["usd"] < min_usd:
                    continue
                s = by_symbol.setdefault(e["symbol"], {
                    "symbol": e["symbol"], "total_usd": 0.0, "count": 0,
                    "max_usd": 0.0, "longs": 0.0, "shorts": 0.0,
                })
                s["total_usd"] += e["usd"]
                s["count"] += 1
                if e["usd"] > s["max_usd"]:
                    s["max_usd"] = e["usd"]
                if e["side"] == "long":
                    s["longs"] += e["usd"]
                else:
                    s["shorts"] += e["usd"]
        out = list(by_symbol.values())
        out.sort(key=lambda x: x["total_usd"], reverse=True)
        return out[:limit]
