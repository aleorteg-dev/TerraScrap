"""In-memory implementation for B2 – world-repository."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import RLock
from typing import Protocol

from twi.wld_parser import World


class WorldNotFoundError(Exception):
    def __init__(self, world_id: str) -> None:
        super().__init__(f"World {world_id!r} not found or TTL expired")
        self.world_id = world_id


class WorldRepository(Protocol):
    def store(self, world: World) -> str: ...

    def get(self, world_id: str) -> World: ...

    def delete(self, world_id: str) -> None: ...

    def delete_strict(self, world_id: str) -> None: ...

    def touch(self, world_id: str) -> None: ...

    def purge_expired(self, now: datetime | None = None) -> int: ...


@dataclass
class _Entry:
    world: World
    last_accessed: datetime


def _utcnow() -> datetime:
    return datetime.now(UTC)


class _InMemoryRepository:
    def __init__(
        self,
        ttl_seconds: int,
        clock: Callable[[], datetime],
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        self._data: dict[str, _Entry] = {}
        self._lock = RLock()

    def _expired(self, entry: _Entry, now: datetime) -> bool:
        return (now - entry.last_accessed).total_seconds() >= self._ttl

    def store(self, world: World) -> str:
        world_id = str(uuid.uuid4())
        with self._lock:
            self._data[world_id] = _Entry(world=world, last_accessed=self._clock())
        return world_id

    def get(self, world_id: str) -> World:
        with self._lock:
            entry = self._data.get(world_id)
            if entry is None:
                raise WorldNotFoundError(world_id)
            now = self._clock()
            if self._expired(entry, now):
                del self._data[world_id]
                raise WorldNotFoundError(world_id)
            entry.last_accessed = now
            return entry.world

    def delete(self, world_id: str) -> None:
        with self._lock:
            self._data.pop(world_id, None)

    def delete_strict(self, world_id: str) -> None:
        with self._lock:
            entry = self._data.get(world_id)
            if entry is None:
                raise WorldNotFoundError(world_id)
            now = self._clock()
            if self._expired(entry, now):
                del self._data[world_id]
                raise WorldNotFoundError(world_id)
            del self._data[world_id]

    def touch(self, world_id: str) -> None:
        with self._lock:
            entry = self._data.get(world_id)
            if entry is None:
                raise WorldNotFoundError(world_id)
            now = self._clock()
            if self._expired(entry, now):
                del self._data[world_id]
                raise WorldNotFoundError(world_id)
            entry.last_accessed = now

    def purge_expired(self, now: datetime | None = None) -> int:
        effective_now = now if now is not None else self._clock()
        with self._lock:
            expired = [
                wid
                for wid, entry in self._data.items()
                if self._expired(entry, effective_now)
            ]
            for wid in expired:
                del self._data[wid]
        return len(expired)


def create_in_memory_repository(
    ttl_seconds: int = 1800,
    clock: Callable[[], datetime] = _utcnow,
) -> WorldRepository:
    return _InMemoryRepository(ttl_seconds=ttl_seconds, clock=clock)
