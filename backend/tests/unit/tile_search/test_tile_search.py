"""Tests for B4 – tile-search (T-01 … T-08 + SP-08)."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

from twi.tile_search import SearchMatch, SearchResult, create_tile_search_engine
from twi.wld_parser import Chest, ChestItem, Tile, TileGrid, World, WorldMetadata

# ---------------------------------------------------------------------------
# Shared sentinel for air tiles
# ---------------------------------------------------------------------------

AIR = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
WORLD_MAP_PATH = (
    Path(__file__).resolve().parents[3]
    / "src"
    / "twi"
    / "tile_search"
    / "data"
    / "item_world_map.json"
)

MINIMUM_ITEM_COVERAGE: dict[str, set[int]] = {
    "block": {
        2,
        3,
        9,
        11,
        12,
        13,
        14,
        56,
        61,
        116,
        169,
        172,
        173,
        174,
        176,
        364,
        365,
        366,
        409,
        593,
        699,
        700,
        701,
        702,
        836,
        880,
        947,
        1101,
        1104,
        1105,
        1106,
        3081,
        3086,
    },
    "wall": {
        26,
        30,
        93,
        135,
        138,
        140,
        1378,
        1379,
        1380,
        1381,
        1382,
        1383,
        4525,
        4526,
        4527,
        4528,
    },
    "object": {8, 29, 109, 221, 438, 473, 524, 1221, 5532, 5533},
}

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


def _tile(tile_id: int | None, wall_id: int | None = None) -> Tile:
    return Tile(
        tile_id=tile_id,
        wall_id=wall_id,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
    )


def _framed_tile(tile_id: int, frame_x: int, frame_y: int) -> Tile:
    return Tile(
        tile_id=tile_id,
        wall_id=None,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=frame_x,
        frame_y=frame_y,
    )


def _object_instance(
    x: int,
    y: int,
    tile_id: int,
    frame_x: int,
    frame_y: int,
    width: int,
    height: int,
) -> dict[tuple[int, int], Tile]:
    return {
        (x + dx, y + dy): _framed_tile(
            tile_id=tile_id,
            frame_x=frame_x + dx * 18,
            frame_y=frame_y + dy * 18,
        )
        for dx in range(width)
        for dy in range(height)
    }


def _world_map_json() -> dict[str, object]:
    raw = json.loads(WORLD_MAP_PATH.read_text(encoding="utf-8"))
    assert isinstance(raw, dict)
    return raw


# ---------------------------------------------------------------------------
# Iteration B4 object/world-map coverage
# ---------------------------------------------------------------------------


def test_engine_finds_block_match() -> None:
    overrides = {
        (0, 0): _tile(0),
        (2, 1): _tile(0),
        (4, 2): _tile(0),
    }
    world = _world(width=5, height=3, tile_overrides=overrides)
    engine = create_tile_search_engine()

    result = engine.search(world, item_id=2)

    assert result.total == 3
    assert {(m.x, m.y, m.source) for m in result.matches} == {
        (0, 0, "block"),
        (2, 1, "block"),
        (4, 2, "block"),
    }


def test_engine_finds_wall_match() -> None:
    overrides = {
        (1, 0): _tile(None, wall_id=1),
        (1, 1): _tile(None, wall_id=1),
        (3, 2): _tile(None, wall_id=1),
    }
    world = _world(width=4, height=3, tile_overrides=overrides)
    engine = create_tile_search_engine()

    result = engine.search(world, item_id=26)

    assert result.total == 3
    assert {(m.x, m.y, m.source) for m in result.matches} == {
        (1, 0, "wall"),
        (1, 1, "wall"),
        (3, 2, "wall"),
    }


def test_engine_finds_object_match_once_per_instance() -> None:
    heart_statue_tile_id = 105
    heart_statue_frame = (1332, 0)
    world = _world(
        width=8,
        height=6,
        tile_overrides=_object_instance(
            x=4,
            y=2,
            tile_id=heart_statue_tile_id,
            frame_x=heart_statue_frame[0],
            frame_y=heart_statue_frame[1],
            width=2,
            height=3,
        ),
    )
    engine = create_tile_search_engine(
        item_to_tile_mapping={},
        item_to_wall_mapping={},
        item_to_object_mapping={473: heart_statue_tile_id},
        item_to_object_frame_mapping={473: heart_statue_frame},
    )

    result = engine.search(world, item_id=473)

    assert result == SearchResult(
        item_id=473,
        total=1,
        matches=(SearchMatch(x=4, y=2, source="object"),),
    )


def test_engine_unknown_item_returns_empty() -> None:
    world = _world(tile_overrides={(2, 2): _tile(0), (3, 3): _tile(None, 1)})
    engine = create_tile_search_engine(
        item_to_tile_mapping={},
        item_to_wall_mapping={},
        item_to_object_mapping={},
    )

    result = engine.search(world, item_id=999_999)

    assert result == SearchResult(item_id=999_999, total=0, matches=())


def test_engine_chest_match_still_works() -> None:
    chest = _chest_with_item(chest_id=7, x=3, y=4, slot=2, item_id=42, stack=12)
    world = _world(chests=(chest,))
    engine = create_tile_search_engine(
        item_to_tile_mapping={},
        item_to_wall_mapping={},
        item_to_object_mapping={},
    )

    result = engine.search(world, item_id=42)

    assert result == SearchResult(
        item_id=42,
        total=1,
        matches=(SearchMatch(x=3, y=4, source="chest", chest_id=7, stack=12),),
    )


def test_data_file_has_minimum_coverage() -> None:
    data = _world_map_json()
    items = data.get("items")
    assert isinstance(items, dict)

    for category, item_ids in MINIMUM_ITEM_COVERAGE.items():
        missing = {
            item_id
            for item_id in item_ids
            if not (
                isinstance(items.get(str(item_id)), dict)
                and items[str(item_id)].get("category") == category
            )
        }
        assert not missing, f"missing {category} mappings: {sorted(missing)}"


def test_data_file_schema_valid() -> None:
    data = _world_map_json()

    assert set(data) == {"items", "version"}
    version = data["version"]
    assert isinstance(version, str)
    version_parts = version.split(".")
    assert len(version_parts) == 3
    assert all(part.isdigit() for part in version_parts)

    items = data["items"]
    assert isinstance(items, dict)

    allowed_categories = {"block", "wall", "object"}
    allowed_keys = {"category", "tile_id", "wall_id", "frame_xy"}
    seen_without_frame: dict[tuple[str, int], str] = {}

    for item_id, entry in items.items():
        assert isinstance(item_id, str)
        assert item_id.isdecimal()
        assert isinstance(entry, dict)
        assert set(entry) <= allowed_keys

        category = entry.get("category")
        assert category in allowed_categories

        frame_xy = entry.get("frame_xy")
        if category == "wall":
            assert set(entry) == {"category", "wall_id"}
            world_id = entry["wall_id"]
        else:
            assert "tile_id" in entry
            assert "wall_id" not in entry
            world_id = entry["tile_id"]

        assert isinstance(world_id, int)

        if frame_xy is not None:
            assert category == "object"
            assert isinstance(frame_xy, list)
            assert len(frame_xy) == 2
            assert all(isinstance(value, int) for value in frame_xy)
            continue

        collision_key = (category, world_id)
        previous = seen_without_frame.get(collision_key)
        assert previous is None, (
            f"collision for {collision_key}: item {previous} and item {item_id}"
        )
        seen_without_frame[collision_key] = item_id


def test_object_with_multiple_frames_uses_frame_xy() -> None:
    tile_id = 500
    world = _world(
        width=8,
        height=3,
        tile_overrides={
            **_object_instance(
                x=1,
                y=1,
                tile_id=tile_id,
                frame_x=0,
                frame_y=0,
                width=2,
                height=1,
            ),
            **_object_instance(
                x=5,
                y=1,
                tile_id=tile_id,
                frame_x=54,
                frame_y=0,
                width=2,
                height=1,
            ),
        },
    )
    engine = create_tile_search_engine(
        item_to_tile_mapping={},
        item_to_wall_mapping={},
        item_to_object_mapping={101: tile_id, 102: tile_id},
        item_to_object_frame_mapping={101: (0, 0), 102: (54, 0)},
    )

    first_result = engine.search(world, item_id=101)
    second_result = engine.search(world, item_id=102)

    assert first_result.matches == (SearchMatch(x=1, y=1, source="object"),)
    assert second_result.matches == (SearchMatch(x=5, y=1, source="object"),)


# ---------------------------------------------------------------------------
# T-01
# ---------------------------------------------------------------------------


def test_search_finds_block_matches() -> None:
    world = _world(
        tile_overrides={
            (2, 3): Tile(
                tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
            (7, 1): Tile(
                tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
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
            (1, 2): Tile(
                tile_id=None, wall_id=7, liquid_type="none", liquid_amount=0, flags=0
            ),
            (4, 0): Tile(
                tile_id=None, wall_id=7, liquid_type="none", liquid_amount=0, flags=0
            ),
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
            (0, 0): Tile(
                tile_id=1, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
            (2, 2): Tile(
                tile_id=1, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
            (4, 1): Tile(
                tile_id=1, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
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
            (1, 1): Tile(
                tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
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
    columns[100][100] = Tile(
        tile_id=target_tile_id,
        wall_id=None,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
    )
    columns[4200][1200] = Tile(
        tile_id=target_tile_id,
        wall_id=None,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
    )

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
        tile_overrides={
            (3, 3): Tile(
                tile_id=1,
                wall_id=None,
                liquid_type="none",
                liquid_amount=0,
                flags=0,
            )
        }
    )
    engine = create_tile_search_engine(item_to_tile_mapping={}, item_to_wall_mapping={})
    result = engine.search(world, item_id=9)
    assert result.total == 0


# ---------------------------------------------------------------------------
# Separate tile mapping: mapped item matches, unmapped item does not
# ---------------------------------------------------------------------------


def test_search_blocks_with_separate_mappings_ignores_unmapped_item() -> None:
    world = _world(
        tile_overrides={
            (2, 2): Tile(
                tile_id=1,
                wall_id=None,
                liquid_type="none",
                liquid_amount=0,
                flags=0,
            )
        }
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
            (2, 1): Tile(
                tile_id=None, wall_id=2, liquid_type="none", liquid_amount=0, flags=0
            ),
            (5, 3): Tile(
                tile_id=None, wall_id=2, liquid_type="none", liquid_amount=0, flags=0
            ),
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
        tile_overrides={
            (1, 1): Tile(
                tile_id=None,
                wall_id=2,
                liquid_type="none",
                liquid_amount=0,
                flags=0,
            )
        }
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
            (0, 0): Tile(
                tile_id=1, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
            ),
            (1, 0): Tile(
                tile_id=None, wall_id=2, liquid_type="none", liquid_amount=0, flags=0
            ),
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


def test_create_tile_search_engine_uses_default_tile_mapping() -> None:
    world = _world(
        tile_overrides={
            (2, 2): Tile(
                tile_id=1,
                wall_id=None,
                liquid_type="none",
                liquid_amount=0,
                flags=0,
            )
        }
    )
    engine = create_tile_search_engine()

    result = engine.search(world, item_id=3)

    assert result == SearchResult(
        item_id=3,
        total=1,
        matches=(SearchMatch(x=2, y=2, source="block"),),
    )


def test_tile_search_module_passes_mypy_strict() -> None:
    backend_root = Path(__file__).resolve().parents[3]
    completed = subprocess.run(
        [sys.executable, "-m", "mypy", "src/twi/tile_search", "--strict"],
        cwd=backend_root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
