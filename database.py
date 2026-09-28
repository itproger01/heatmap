"""
SQLite в режиме WAL с батчевой записью.
Пишем раз в N секунд через executemany, чтобы не убить IOPS.
"""
import os
import queue
import sqlite3
import threading
import time
from typing import Iterable, List, Dict, Any

DB_PATH = os.environ.get("HEATMAP_DB", "heatmap.db")


class Database:
    def __init__(self, path: str = DB_PATH):
        self.path = path
        self._local = threading.local()
        self._queue: "queue.Queue[List[tuple]]" = queue.Queue(maxsize=200_000)
        self._stop = threading.Event()
        self._writer = threading.Thread(target=self._writer_loop, daemon=True, name="db-writer")
        self._pruner = threading.Thread(target=self._pruner_loop, daemon=True, name="db-pruner")
        self._init_schema()
        self._writer.start()
        self._pruner.start()

    # ---------------- connection ----------------
    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.path, check_same_thread=False, timeout=30.0)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA temp_store=MEMORY;")
            conn.execute("PRAGMA mmap_size=268435456;")
            conn.execute("PRAGMA cache_size=-65536;")
            self._local.conn = conn
        return conn

    def _init_schema(self):
        c = self._conn()
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS heatmap (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol    TEXT    NOT NULL,
                timestamp INTEGER NOT NULL,
                price     REAL    NOT NULL,
                usd_value REAL    NOT NULL,
                lifespan  REAL    NOT NULL DEFAULT 0,
                side      TEXT    NOT NULL DEFAULT 'bid'
            );

            CREATE INDEX IF NOT EXISTS idx_hm_sym_ts
                ON heatmap(symbol, timestamp);
            CREATE INDEX IF NOT EXISTS idx_hm_sym_price_ts
                ON heatmap(symbol, price, timestamp);

            CREATE TABLE IF NOT EXISTS wall_stats (
                symbol     TEXT PRIMARY KEY,
                score      REAL NOT NULL DEFAULT 0,
                walls      INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            """
        )
        c.commit()

    # ---------------- writes ----------------
    def enqueue(self, rows: Iterable[tuple]):
        """rows = (symbol, timestamp, price, usd_value, lifespan, side)"""
        try:
            self._queue.put_nowait(list(rows))
        except queue.Full:
            # Перегрузка: дропаем пакет, чтобы не блокировать asyncio-поток
            pass

    def _writer_loop(self):
        from config import CONFIG
        conn = self._conn()
        pending: List[tuple] = []
        last_flush = time.time()
        last_cleanup_flush = time.time()

        while not self._stop.is_set():
            timeout = max(0.05, CONFIG.db_interval - (time.time() - last_flush))
            try:
                batch = self._queue.get(timeout=timeout)
                pending.extend(batch)
            except queue.Empty:
                pass

            due = (time.time() - last_flush) >= CONFIG.db_interval
            if pending and (due or len(pending) >= 20_000):
                try:
                    conn.executemany(
                        "INSERT INTO heatmap "
                        "(symbol, timestamp, price, usd_value, lifespan, side) "
                        "VALUES (?,?,?,?,?,?)",
                        pending,
                    )
                    conn.commit()
                    pending.clear()
                except Exception:
                    conn.rollback()
                last_flush = time.time()

            # периодический WAL checkpoint
            if time.time() - last_cleanup_flush > 60:
                try:
                    conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
                except Exception:
                    pass
                last_cleanup_flush = time.time()

    def _pruner_loop(self):
        from config import CONFIG
        while not self._stop.is_set():
            time.sleep(600)
            try:
                conn = self._conn()
                cutoff = int(time.time()) - CONFIG.history_hours * 3600
                conn.execute("DELETE FROM heatmap WHERE timestamp < ?", (cutoff,))
                conn.commit()
                conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            except Exception:
                pass

    # ---------------- reads ----------------
    def history(self, symbol: str, resolution: int = 60, step: float = 1.0,
                hours: int = None) -> List[Dict[str, Any]]:
        from config import CONFIG
        hours = hours or CONFIG.history_hours
        since = int(time.time()) - hours * 3600
        resolution = max(1, int(resolution))
        step = max(1e-9, float(step))

        conn = self._conn()
        cur = conn.execute(
            """
            SELECT CAST(timestamp / ? AS INTEGER) * ? AS bucket,
                   CAST(price / ? AS INTEGER) * ?     AS lvl,
                   MAX(usd_value)                     AS usd,
                   MAX(lifespan)                      AS ls,
                   side
            FROM heatmap
            WHERE symbol = ? AND timestamp >= ?
            GROUP BY bucket, lvl, side
            ORDER BY bucket ASC
            """,
            (resolution, resolution, step, step, symbol, since),
        )
        out = []
        for bucket, lvl, usd, ls, side in cur.fetchall():
            out.append({"t": int(bucket), "p": float(lvl), "u": float(usd),
                        "l": float(ls), "s": side})
        return out

    def update_symbol_stats(self, stats: Dict[str, Dict[str, float]]):
        if not stats:
            return
        conn = self._conn()
        now = int(time.time())
        rows = [(s, v.get("score", 0.0), int(v.get("walls", 0)), now)
                for s, v in stats.items()]
        try:
            conn.executemany(
                "INSERT INTO wall_stats(symbol, score, walls, updated_at) VALUES (?,?,?,?) "
                "ON CONFLICT(symbol) DO UPDATE SET "
                "score=excluded.score, walls=excluded.walls, updated_at=excluded.updated_at",
                rows,
            )
            conn.commit()
        except Exception:
            conn.rollback()

    def long_standing_walls(self, symbol: str, min_age_sec: int,
                             activity_window_sec: int = 120,
                             scan_hours: int = 24) -> List[Dict[str, Any]]:
        """
        Плотности, которые СУЩЕСТВУЮТ в стакане >= min_age_sec секунд.

        Ключевой момент: first_seen считается как (timestamp - lifespan)
        — то есть момент появления стены в стакане, а не момент записи в БД.
        """
        now = int(time.time())
        cutoff = now - min_age_sec
        active_since = now - activity_window_sec
        scan_since = now - scan_hours * 3600

        conn = self._conn()
        cur = conn.execute(
            """
            SELECT CAST(price AS REAL) AS p,
                   side,
                   MIN(timestamp - lifespan) AS first_seen,
                   MAX(timestamp)            AS last_seen,
                   MAX(usd_value)            AS usd
            FROM heatmap
            WHERE symbol = ? AND timestamp >= ?
            GROUP BY CAST(price AS REAL), side
            HAVING first_seen <= ? AND last_seen >= ?
            """,
            (symbol, scan_since, cutoff, active_since),
        )
        out = []
        for p, s, fs, ls, u in cur.fetchall():
            out.append({
                "price": float(p),
                "side": s,
                "first_seen": int(fs),
                "last_seen": int(ls),
                "usd": float(u or 0),
            })
        return out





    def shutdown(self):
        self._stop.set()


DB = Database()
