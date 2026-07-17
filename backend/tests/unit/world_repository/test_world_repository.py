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


def test_get_extends_ttl() -> None:
    """get() is the single TTL-refresh path since touch() was removed (IT-16)."""
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])

    world = _make_world()
    world_id = repo.store(world)

    # Advance to 59 s (just before expiry) and access the world
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 59)
    assert repo.get(world_id) is world

    # Advance another 59 s from the access (118 s from store)
    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 58)

    # Should still be alive (only 59 s elapsed since last access)
    assert repo.get(world_id) is world


# ---------------------------------------------------------------------------
# T-06 (IT-16, M02): touch/delete removed from the Protocol
# ---------------------------------------------------------------------------


def test_repository_has_no_touch_or_lenient_delete() -> None:
    """v2.0 removes touch() (get refreshes TTL) and non-strict delete()."""
    repo = create_in_memory_repository()
    assert not hasattr(repo, "touch")
    assert not hasattr(repo, "delete")
    assert hasattr(repo, "delete_strict")


# ---------------------------------------------------------------------------
# T-07
# ---------------------------------------------------------------------------


def test_purge_expired_removes_only_expired_entries() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])

    id_alive = repo.store(_make_world("alive"))
    id_expired = repo.store(_make_world("expired"))

    # Access "alive" at 59 s so its TTL resets; "expired" stays at t=0
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 59)
    repo.get(id_alive)

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


# ---------------------------------------------------------------------------
# T-09
# ---------------------------------------------------------------------------


def test_delete_strict_removes_existing_world() -> None:
    repo = create_in_memory_repository()
    world = _make_world()
    world_id = repo.store(world)

    repo.delete_strict(world_id)

    with pytest.raises(WorldNotFoundError):
        repo.get(world_id)


def test_delete_strict_raises_on_unknown_id() -> None:
    repo = create_in_memory_repository()
    with pytest.raises(WorldNotFoundError) as exc_info:
        repo.delete_strict("nonexistent-id")
    assert exc_info.value.world_id == "nonexistent-id"


def test_delete_strict_raises_on_expired_world() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(ttl_seconds=60, clock=lambda: clock_ref[0])
    world = _make_world()
    world_id = repo.store(world)

    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 1)  # past TTL

    with pytest.raises(WorldNotFoundError) as exc_info:
        repo.delete_strict(world_id)
    assert exc_info.value.world_id == world_id


# ---------------------------------------------------------------------------
# T-09d – thread-safety for delete_strict
# ---------------------------------------------------------------------------


def test_delete_strict_concurrent_deletes_no_race_condition() -> None:
    """Exactly one thread succeeds; all others raise WorldNotFoundError; no crash."""
    repo = create_in_memory_repository()
    world_id = repo.store(_make_world())

    successes: list[int] = []
    not_found: list[int] = []
    lock = threading.Lock()

    def try_delete() -> None:
        try:
            repo.delete_strict(world_id)
            with lock:
                successes.append(1)
        except WorldNotFoundError:
            with lock:
                not_found.append(1)

    threads = [threading.Thread(target=try_delete) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(successes) == 1
    assert len(not_found) == 9


# ---------------------------------------------------------------------------
# T-10 (IT-16, P10) – max_worlds cap with LRU eviction
# ---------------------------------------------------------------------------


def test_store_beyond_max_worlds_evicts_least_recently_accessed() -> None:
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(
        ttl_seconds=3600, clock=lambda: clock_ref[0], max_worlds=2
    )

    id_a = repo.store(_make_world("A"))
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 1)
    id_b = repo.store(_make_world("B"))

    # Access A so B becomes the least recently accessed world.
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 2)
    repo.get(id_a)

    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 3)
    id_c = repo.store(_make_world("C"))

    with pytest.raises(WorldNotFoundError):
        repo.get(id_b)
    assert repo.get(id_a).metadata.name == "A"
    assert repo.get(id_c).metadata.name == "C"


def test_store_beyond_max_worlds_prefers_purging_expired_entries() -> None:
    """An expired world is reclaimed before evicting a live LRU world."""
    clock_ref = _frozen_clock(datetime(2000, 1, 1, 0, 0, 0))
    repo = create_in_memory_repository(
        ttl_seconds=60, clock=lambda: clock_ref[0], max_worlds=2
    )

    id_expired = repo.store(_make_world("expired"))
    clock_ref[0] = datetime(2000, 1, 1, 0, 0, 59)
    id_alive = repo.store(_make_world("alive"))

    # id_expired ages out (61 s without access); id_alive is 2 s old.
    clock_ref[0] = datetime(2000, 1, 1, 0, 1, 1)
    id_new = repo.store(_make_world("new"))

    assert repo.get(id_alive).metadata.name == "alive"
    assert repo.get(id_new).metadata.name == "new"
    with pytest.raises(WorldNotFoundError):
        repo.get(id_expired)


def test_store_without_cap_keeps_all_worlds() -> None:
    repo = create_in_memory_repository()
    ids = [repo.store(_make_world(f"w{i}")) for i in range(5)]
    for i, world_id in enumerate(ids):
        assert repo.get(world_id).metadata.name == f"w{i}"


def test_max_worlds_below_one_raises_value_error() -> None:
    with pytest.raises(ValueError):
        create_in_memory_repository(max_worlds=0)
