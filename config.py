"""
Глобальный runtime-конфиг, разделяемый между app.py и data_collector.py.
Все параметры можно менять на лету через REST API.
"""
import threading


class RuntimeConfig:
    def __init__(self):
        self._lock = threading.RLock()

        # --- Anti-Spoofing ---
        self.min_usd = 50_000.0          # отсекаем всё, что меньше $100k
        self.max_usd = 2_000_000.0        # "институциональный" потолок для нормализации
        self.min_lifespan = 5.0           # секунд, после которых стена считается настоящей

        # --- Семплирование ---
        self.emit_interval = 0.2          # как часто пушим снапшот в WebSocket (сек)
        self.db_interval = 10.0           # как часто пишем снапшот в SQLite (сек)
        self.max_levels_per_symbol = 14   # сколько уровней на символ пишем в БД
        self.persist_min_usd = 250_000.0  # порог для записи в историю

        # --- История ---
        self.history_hours = 6            # глубина хранения
        self.max_symbols = 0              # 0 = все доступные USDT-перпы

    def get(self) -> dict:
        with self._lock:
            return {
                "min_usd": self.min_usd,
                "max_usd": self.max_usd,
                "min_lifespan": self.min_lifespan,
                "emit_interval": self.emit_interval,
                "db_interval": self.db_interval,
                "max_levels_per_symbol": self.max_levels_per_symbol,
                "persist_min_usd": self.persist_min_usd,
                "history_hours": self.history_hours,
            }

    def update(self, **kwargs):
        with self._lock:
            for k, v in kwargs.items():
                if hasattr(self, k) and v is not None:
                    setattr(self, k, type(getattr(self, k))(v))
        return self.get()


CONFIG = RuntimeConfig()
