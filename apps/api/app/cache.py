from __future__ import annotations

import time
from threading import Lock
from typing import Any


class TTLResultCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = Lock()

    def set(self, key: str, value: dict[str, Any]) -> None:
        expires_at = time.time() + self.ttl_seconds
        with self._lock:
            self._items[key] = (expires_at, value)

    def get(self, key: str) -> dict[str, Any] | None:
        now = time.time()
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._items.pop(key, None)
                return None
            return value

    def prune(self) -> None:
        now = time.time()
        with self._lock:
            expired = [key for key, (expires_at, _) in self._items.items() if expires_at <= now]
            for key in expired:
                self._items.pop(key, None)

