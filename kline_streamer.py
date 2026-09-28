"""
WebSocket-стример kline активного символа.
Одно соединение к Bybit, подписка меняется динамически при смене монеты.
"""
import asyncio
import logging
import time
from typing import Optional, Callable

import orjson
import websockets

log = logging.getLogger("kline")

BYBIT_WS = "wss://stream.bybit.com/v5/public/linear"

_INTERVAL_MAP = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1d": "D", "1w": "W", "1M": "M",
}


class KlineStreamer:
    """
    Держит одно WS-соединение к Bybit.
    По команде set_symbol(symbol, interval) — меняет подписку.
    Каждый тик вызывает on_update(candle_dict).
    """

    def __init__(self, on_update: Callable[[dict], None]):
        self.on_update = on_update
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._task: Optional[asyncio.Task] = None
        self._stop = False
        self._current_topic: Optional[str] = None
        self._lock = asyncio.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def start(self):
        self._loop = asyncio.get_running_loop()
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._stop = True
        if self._task:
            self._task.cancel()

    def set_topic_sync(self, symbol: str, interval: str):
        """Вызывается из любого потока (Flask)."""
        if not self._loop:
            return
        topic = f"kline.{_INTERVAL_MAP.get(interval, '1')}.{symbol.upper()}"
        asyncio.run_coroutine_threadsafe(self._set_topic(topic), self._loop)

    async def _set_topic(self, topic: str):
        async with self._lock:
            if topic == self._current_topic:
                return
            old = self._current_topic
            self._current_topic = topic
            if self._ws is not None:
                try:
                    if old:
                        await self._ws.send(orjson.dumps({
                            "op": "unsubscribe", "args": [old]
                        }).decode())
                    await self._ws.send(orjson.dumps({
                        "op": "subscribe", "args": [topic]
                    }).decode())
                    log.info("kline topic: %s → %s", old, topic)
                except Exception as e:
                    log.warning("kline subscribe fail: %s", e)

    async def _run(self):
        backoff = 1.0
        while not self._stop:
            try:
                async with websockets.connect(
                    BYBIT_WS,
                    ping_interval=15,
                    ping_timeout=10,
                    max_size=2 ** 22,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    backoff = 1.0
                    log.info("kline WS подключён")

                    # подписка на текущий topic
                    async with self._lock:
                        if self._current_topic:
                            await ws.send(orjson.dumps({
                                "op": "subscribe", "args": [self._current_topic]
                            }).decode())

                    # pinger
                    async def ping():
                        while True:
                            await asyncio.sleep(12)
                            try:
                                await ws.send(orjson.dumps({"op": "ping"}).decode())
                            except Exception:
                                return
                    ping_task = asyncio.create_task(ping())

                    try:
                        async for raw in ws:
                            if self._stop:
                                break
                            try:
                                msg = orjson.loads(raw)
                            except Exception:
                                continue
                            if msg.get("op") == "pong":
                                continue
                            topic = msg.get("topic", "")
                            if not topic.startswith("kline."):
                                continue
                            for item in msg.get("data", []) or []:
                                try:
                                    candle = {
                                        "time": int(int(item["start"]) // 1000),
                                        "open": float(item["open"]),
                                        "high": float(item["high"]),
                                        "low": float(item["low"]),
                                        "close": float(item["close"]),
                                        "volume": float(item["volume"]),
                                        "confirm": bool(item.get("confirm", False)),
                                    }
                                    self.on_update(candle)
                                except Exception as e:
                                    log.debug("kline parse: %s", e)
                    finally:
                        ping_task.cancel()

            except asyncio.CancelledError:
                return
            except Exception as e:
                log.warning("kline WS упал: %s — реконнект через %.1fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)
            finally:
                self._ws = None
