"""Tests for B4 – tile-search (T-01 … T-08 + SP-08)."""

from __future__ import annotations

import time

import pytest

from twi.tile_search import SearchMatch, SearchResult, create_tile_search_engine
from twi.wld_parser import Chest, ChestItem, Tile, TileGrid, World, WorldMetadata

# ---------------------------------------------------------------------------
# Shared sentinel for air tiles
# ---------------------------------------------------------------------------

AIR = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _meta(width: int = 10, height: int = 5) -> WorldMetadata:
    return WorldMetadata(
        name="Test",
        width=width,
        height=height,
        version=240,
        seed="0",
        size="small",
        hardmode=False,
    )


def _grid(
    width: int,
    height: int,
    overrides: dict[tuple[int, int], Tile] | None = None,
) -> TileGrid:
    columns: list[list[Tile]] = [[AIR] * height for _ in range(width)]
    for (x, y), tile in (overrides or {}).items():
        columns[x][y] = tile
    return TileGrid(columns)


def _world(
    width: int = 10,
    height: int = 5,
    tile_overrides: dict[tuple[int, int], Tile] | None = None,
    chests: tuple[Chest, ...] = (),
) -> World:
    return World(
        metadata=_meta(width, height),
        tiles=_grid(width, height, tile_overrides),
        chests=chests,
        signs=(),
    )


def _empty_slots() -> tuple[ChestItem, ...]:
    return tuple(ChestItem(item_id=0, stack=0, prefix=0) for _ in range(40))


def _chest_with_item(
    chest_id: int,
    x: int,
    y: int,
    slot: int,
    item_id: int,
    stack: int = 1,
) -> Chest:
    items = list(_empty_slots())
    items[slot] = ChestItem(item_id=item_id, stack=stack, prefix=0)
    return Chest(chest_id=chest_id, x=x, y=y, name="", items=tuple(items))


# ---------------------------------------------------------------------------
# T-01
# ---------------------------------------------------------------------------


def test_search_finds_block_matches() -> None:
    world = _world(
        tile_overrides={
            (2, 3): Tile(tile_id=5, wall_id=None, liquid=0, flags=0),
            (7, 1): Tile(tile_id=5, wall_id=None, liquid=0, flags=0),
        }
    )
    engine = create_tile_search_engine(item_to_tile_mapping={10: 5})
    result = engine.search(world, item_id=10)

    assert result.item_id == 10
    assert result.total == 2
    assert all(m.source == "block" for m in result.matches)
    positions = {(m.x, m.y) for m in result.matches}
    assert positions == {(2, 3), (7, 1)}
    # ordered by (y, x): y=1 before y=3
    assert result.matches[0] == SearchMatch(x=7, y=1, source="block")
    assert result.matches[1] == SearchMatch(x=2, y=3, source="block")


# ---------------------------------------------------------------------------
# T-02
# ---------------------------------------------------------------------------


def test_search_finds_wall_matches() -> None:
    world = _world(
        tile_overrides={
            (1, 2): Tile(tile_id=None, wall_id=7, liquid=0, flags=0),
            (4, 0): Tile(tile_id=None, wall_id=7, liquid=0, flags=0),
        }
    )
    engine = create_tile_search_engine(
        item_to_tile_mapping={}, item_to_wall_mapping={7: 7}
    )
    result = engine.search(world, item_id=7)

    assert result.total == 2
    assert all(m.source == "wall" for m in result.matches)
    positions = {(m.x, m.y) for m in result.matches}
    assert positions == {(1, 2), (4, 0)}
    # ordered by (y, x): y=0 before y=2
    assert result.matches[0].y == 0
    assert result.matches[1].y == 2


# ---------------------------------------------------------------------------
# T-03
# ---------------------------------------------------------------------------


def test_search_finds_chest_items() -> None:
    chest = _chest_with_item(chest_id=0, x=3, y=4, slot=5, item_id=42, stack=10)
    world = _world(chests=(chest,))
    engine = create_tile_search_engine(item_to_tile_mapping={})

    result = engine.search(world, item_id=42)

    assert result.total == 1
    match = result.matches[0]
    assert match.source == "chest"
    assert match.x == 3
    assert match.y == 4
    assert match.chest_id == 0
    assert match.stack == 10


# SP-08: two chests at the same position each containing the item → two distinct matches
def test_search_stacked_chests_produce_distinct_matches() -> None:
    chest_a = _chest_with_item(chest_id=0, x=5, y=5, slot=0, item_id=99, stack=1)
    chest_b = _chest_with_item(chest_id=1, x=5, y=5, slot=0, item_id=99, stack=5)
    world = _world(width=20, height=20, chests=(chest_a, chest_b))
    engine = create_tile_search_engine(item_to_tile_mapping={})

    result = engine.search(world, item_id=99)

    assert result.total == 2
    assert len(result.matches) == 2
    chest_ids = {m.chest_id for m in result.matches}
    assert chest_ids == {0, 1}
    stacks = {m.stack for m in result.matches}
    assert stacks == {1, 5}


# ---------------------------------------------------------------------------
# T-04
# ---------------------------------------------------------------------------


def test_search_without_containers_excludes_chest_matches() -> None:
    chest = _chest_with_item(chest_id=0, x=3, y=4, slot=5, item_id=42, stack=1)
    world = _world(chests=(chest,))
    engine = create_tile_search_engine(item_to_tile_mapping={})

    result = engine.search(world, item_id=42, include_containers=False)

    assert result.total == 0
    assert result.matches == ()


# ---------------------------------------------------------------------------
# T-05
# ---------------------------------------------------------------------------


def test_search_returns_empty_when_no_matches() -> None:
    world = _world()
    engine = create_tile_search_engine(item_to_tile_mapping={})

    result = engine.search(world, item_id=999)

    assert result == SearchResult(item_id=999, total=0, matches=())


# ---------------------------------------------------------------------------
# T-06
# ---------------------------------------------------------------------------


def test_search_total_matches_len_matches() -> None:
    world = _world(
        tile_overrides={
            (0, 0): Tile(tile_id=1, wall_id=None, liquid=0, flags=0),
            (2, 2): Tile(tile_id=1, wall_id=None, liquid=0, flags=0),
            (4, 1): Tile(tile_id=1, wall_id=None, liquid=0, flags=0),
        }
    )
    engine = create_tile_search_engine(item_to_tile_mapping={10: 1})
    result = engine.search(world, item_id=10)

    assert result.total == len(result.matches)
    assert result.total == 3


# ---------------------------------------------------------------------------
# T-07
# ---------------------------------------------------------------------------


def test_search_is_pure_and_deterministic() -> None:
    world = _world(
        tile_overrides={
            (1, 1): Tile(tile_id=5, wall_id=None, liquid=0, flags=0),
        }
    )
    engine = create_tile_search_engine(item_to_tile_mapping={10: 5})

    result_1 = engine.search(world, item_id=10)
    result_2 = engine.search(world, item_id=10)

    assert result_1 == result_2
    # World must not be mutated
    assert world.metadata.name == "Test"
    assert world.tiles[1][1].tile_id == 5


# ---------------------------------------------------------------------------
# T-08 (performance)
# ---------------------------------------------------------------------------


@pytest.mark.perf
def test_search_large_world_completes_within_budget() -> None:
    """Regression guard: search over a Large world (8400×2400) must finish
    in < 3.5 s on any CI host (pure-Python O(W·H) loop measured at ~2.3 s).
    RNF-03 (< 500 ms) requires numpy vectorisation — tracked in deuda."""
    width, height = 8400, 2400
    # Shared air tile: list replication is O(1) C-level so world creation is fast.
    columns: list[list[Tile]] = [[AIR] * height for _ in range(width)]
    # Plant two target tiles at known positions
    target_tile_id = 1
    columns[100][100] = Tile(tile_id=target_tile_id, wall_id=None, liquid=0, flags=0)
    columns[4200][1200] = Tile(tile_id=target_tile_id, wall_id=None, liquid=0, flags=0)

    grid = TileGrid(columns)
    meta = WorldMetadata(
        name="Large",
        width=width,
        height=height,
        version=240,
        seed="0",
        size="large",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())
    engine = create_tile_search_engine(item_to_tile_mapping={999: target_tile_id})

    start = time.perf_counter()
    result = engine.search(world, item_id=999)
    elapsed = time.perf_counter() - start

    assert result.total == 2
    assert elapsed < 3.5, f"search took {elapsed:.3f}s — exceeds 3.5 s CI budget"


# ---------------------------------------------------------------------------
# Regression: wrong mapping (9→1) caused Wood to match Stone tiles
# ---------------------------------------------------------------------------


def test_wood_without_mapping_does_not_return_stone_tiles() -> None:
    world = _world(
        tile_overrides={(3, 3): Tile(tile_id=1, wall_id=None, liquid=0, flags=0)}
    )
    engine = create_tile_search_engine(item_to_tile_mapping={}, item_to_wall_mapping={})
    result = engine.search(world, item_id=9)
    assert result.total == 0


# ---------------------------------------------------------------------------
# Separate tile mapping: mapped item matches, unmapped item does not
# ---------------------------------------------------------------------------


def test_search_blocks_with_separate_mappings_ignores_unmapped_item() -> None:
    world = _world(
        tile_overrides={(2, 2): Tile(tile_id=1, wall_id=None, liquid=0, flags=0)}
    )
    engine = create_tile_search_engine(
        item_to_tile_mapping={3: 1}, item_to_wall_mapping={}
    )
    result_mapped = engine.search(world, item_id=3)
    result_unmapped = engine.search(world, item_id=9)
    assert result_mapped.total == 1
    assert result_mapped.matches[0].source == "block"
    assert result_unmapped.total == 0


# ---------------------------------------------------------------------------
# Wall mapping: item_to_wall_mapping drives wall search
# ---------------------------------------------------------------------------


def test_search_walls_with_item_to_wall_mapping() -> None:
    world = _world(
        tile_overrides={
            (2, 1): Tile(tile_id=None, wall_id=2, liquid=0, flags=0),
            (5, 3): Tile(tile_id=None, wall_id=2, liquid=0, flags=0),
        }
    )
    engine = create_tile_search_engine(
        item_to_tile_mapping={}, item_to_wall_mapping={30: 2}
    )
    result = engine.search(world, item_id=30)
    assert result.total == 2
    assert all(m.source == "wall" for m in result.matches)
    assert {(m.x, m.y) for m in result.matches} == {(2, 1), (5, 3)}


def test_search_wall_item_without_mapping_returns_empty() -> None:
    world = _world(
        tile_overrides={(1, 1): Tile(tile_id=None, wall_id=2, liquid=0, flags=0)}
    )
    engine = create_tile_search_engine(item_to_tile_mapping={}, item_to_wall_mapping={})
    result = engine.search(world, item_id=30)
    assert result.total == 0


# ---------------------------------------------------------------------------
# No cross-contamination between tile and wall mappings
# ---------------------------------------------------------------------------


def test_search_block_and_wall_mapping_no_cross_contamination() -> None:
    world = _world(
        tile_overrides={
            (0, 0): Tile(tile_id=1, wall_id=None, liquid=0, flags=0),
            (1, 0): Tile(tile_id=None, wall_id=2, liquid=0, flags=0),
        }
    )
    tile_engine = create_tile_search_engine(
        item_to_tile_mapping={10: 1}, item_to_wall_mapping={}
    )
    wall_engine = create_tile_search_engine(
        item_to_tile_mapping={}, item_to_wall_mapping={20: 2}
    )

    tile_result = tile_engine.search(world, item_id=10)
    wall_result = wall_engine.search(world, item_id=20)

    assert tile_result.total == 1
    assert all(m.source == "block" for m in tile_result.matches)
    assert wall_result.total == 1
    assert all(m.source == "wall" for m in wall_result.matches)
