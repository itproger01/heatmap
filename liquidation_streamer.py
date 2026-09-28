"""WS-стример ликвидаций Bybit v5."""
import asyncio
import logging
from typing import Callable, List

import orjson
import websockets

log = logging.getLogger("liq")

BYBIT_WS = "wss://stream.bybit.com/v5/public/linear"
GROUP_SIZE = 50
SUB_BATCH = 10


class LiquidationStreamer:
    def __init__(self, symbols: List[str], on_event: Callable[[dict], None]):
        self.symbols = symbols
        self.on_event = on_event
        self._stop = asyncio.Event()

    def stop(self):
        self._stop.set()

    async def run(self):
        groups = [self.symbols[i:i + GROUP_SIZE]
                  for i in range(0, len(self.symbols), GROUP_SIZE)]
        log.info("Ликвидации: запускаю %d WS-групп", len(groups))
        tasks = [asyncio.create_task(self._worker(g)) for g in groups]
        await asyncio.gather(*tasks)

    async def _worker(self, group: List[str]):
        args = [f"allLiquidation.{s}" for s in group]
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
                    log.info("Ликвидации WS: %d символов", len(group))
                    backoff = 1.0
                    for i in range(0, len(args), SUB_BATCH):
                        batch = args[i:i + SUB_BATCH]
                        await ws.send(orjson.dumps({
                            "op": "subscribe", "args": batch
                        }).decode())
                        await asyncio.sleep(0.05)

                    async def pinger():
                        while True:
                            try:
                                await ws.send(orjson.dumps({"op": "ping"}).decode())
                                await asyncio.sleep(15)
                            except Exception:
                                return
                    ptask = asyncio.create_task(pinger())

                    try:
                        async for raw in ws:
                            if self._stop.is_set():
                                break
                            try:
                                msg = orjson.loads(raw)
                            except Exception:
                                continue
                            if msg.get("op") == "pong":
                                continue
                            topic = msg.get("topic", "")
                            if not topic.startswith("allLiquidation."):
                                continue
                            for item in msg.get("data", []) or []:
                                try:
                                    sym = item.get("s", "")
                                    side_raw = item.get("S", "")
                                    price = float(item.get("p", 0))
                                    qty = float(item.get("v", 0))
                                    ts = int(item.get("T", 0)) // 1000
                                    if not sym or price <= 0 or qty <= 0:
                                        continue
                                    side = "long" if side_raw == "Sell" else "short"
                                    self.on_event({
                                        "symbol": sym,
                                        "side": side,
                                        "price": price,
                                        "qty": qty,
                                        "usd": price * qty,
                                        "ts": ts,
                                    })
                                except Exception:
                                    continue
                    finally:
                        ptask.cancel()

            except asyncio.CancelledError:
                return
            except Exception as e:
                log.warning("Ликвидации WS упали: %s — реконнект %.1fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)
