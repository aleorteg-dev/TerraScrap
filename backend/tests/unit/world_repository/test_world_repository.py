"""Tests for B2 – world-repository (T-01 … T-08)."""

from __future__ import annotations

import threading
import uuid
from datetime import datetime

import pytest

from twi.wld_parser import Tile, TileGrid, World, WorldMetadata
from twi.world_repository import WorldNotFoundError, create_in_memory_repository

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _make_world(name: str = "TestWorld") -> World:
    meta = WorldMetadata(
        name=name,
        width=100,
        height=100,
        version=250,
        seed="0",
        size="small",
        hardmode=False,
    )
    tile = Tile(
        tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
    )
    grid = TileGrid([[tile]])
    return World(metadata=meta, tiles=grid, chests=(), signs=())


def _frozen_clock(t: datetime) -> list[datetime]:
    """Return a mutable one-element list so tests can advance the clock."""
    return [t]


# ---------------------------------------------------------------------------
# T-01
# ---------------------------------------------------------------------------


def test_store_returns_unique_uuid_per_call() -> None:
    repo = create_in_memory_repository()
    world = _make_world()
    id1 = repo.store(world)
    id2 = repo.store(world)
    assert id1 != id2
    uuid.UUID(id1)  # raises ValueError if not a valid UUID
    uuid.UUID(id2)


# ---------------------------------------------------------------------------
# T-02
# ---------------------------------------------------------------------------


def test_get_returns_stored_world() -> None:
    repo = create_in_memory_repository()
    world = _make_world()
    world_id = repo.store(world)
    assert repo.get(world_id) is world


# ---------------------------------------------------------------------------
# T-03
# ---------------------------------------------------------------------------


def test_get_unknown_id_raises_world_not_found_error() -> None:
    repo = create_in_memory_repository()
    with pytest.raises(WorldNotFoundError) as exc_info:
        repo.get("nonexistent-id")
    assert exc_info.value.world_id == "nonexistent-id"


# ---------------------------------------------------------------------------
# T-04
# ---------------------------------------------------------------------------


def test_get_after_ttl_expires_raises_world_not_found_error() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])

    world = _make_world()
    world_id = repo.store(world)

    # Advance clock past TTL (61 s)
    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 1)

    with pytest.raises(WorldNotFoundError) as exc_info:
        repo.get(world_id)
    assert exc_info.value.world_id == world_id


# ---------------------------------------------------------------------------
# T-05
# ---------------------------------------------------------------------------


def test_touch_extends_ttl() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])

    world = _make_world()
    world_id = repo.store(world)

    # Advance to 59 s (just before expiry) and touch
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 59)
    repo.touch(world_id)

    # Advance another 59 s from touch (118 s from store, only 59 s from touch)
    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 58)

    # Should still be alive (only 59 s elapsed since touch)
    assert repo.get(world_id) is world


# ---------------------------------------------------------------------------
# T-06
# ---------------------------------------------------------------------------


def test_delete_is_idempotent() -> None:
    repo = create_in_memory_repository()
    world = _make_world()
    world_id = repo.store(world)

    repo.delete(world_id)
    repo.delete(world_id)  # must not raise

    with pytest.raises(WorldNotFoundError):
        repo.get(world_id)


# ---------------------------------------------------------------------------
# T-07
# ---------------------------------------------------------------------------


def test_purge_expired_removes_only_expired_entries() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])

    id_alive = repo.store(_make_world("alive"))
    id_expired = repo.store(_make_world("expired"))

    # Touch "alive" at 59 s so its TTL resets; "expired" stays at t=0
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 59)
    repo.touch(id_alive)

    # Now at 61 s: "expired" is 61 s old (expired), "alive" is only 2 s from touch
    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 1)

    purged = repo.purge_expired()
    assert purged == 1

    assert repo.get(id_alive) is not None  # alive survives

    with pytest.raises(WorldNotFoundError):
        repo.get(id_expired)


# ---------------------------------------------------------------------------
# T-08
# ---------------------------------------------------------------------------


def test_concurrent_store_and_get_is_safe() -> None:
    repo = create_in_memory_repository()
    errors: list[Exception] = []
    stored_ids: list[str] = []
    lock = threading.Lock()

    def worker() -> None:
        try:
            w = _make_world()
            wid = repo.store(w)
            with lock:
                stored_ids.append(wid)
            _ = repo.get(wid)
        except Exception as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert len(stored_ids) == 20
