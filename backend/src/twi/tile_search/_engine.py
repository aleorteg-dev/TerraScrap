"""B4 – tile-search: engine implementation (pure domain, no FastAPI)."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Protocol

from twi.tile_search._mapping import (
    ItemWorldMap,
    WorldMapEntry,
    create_item_world_map,
    load_item_world_map,
)
from twi.tile_search._types import SearchMatch, SearchResult
from twi.wld_parser import Tile, World

_DATA_DIR = Path(__file__).parent / "data"
_FRAME_STEP = 18


class TileSearchEngine(Protocol):
    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult: ...


class _Engine:
    """Concrete search engine.  Stateless between calls (SP-07)."""

    def __init__(
        self,
        item_world_map: ItemWorldMap,
    ) -> None:
        self._entries: dict[int, WorldMapEntry] = dict(item_world_map.entries)

    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult:
        matches: list[SearchMatch] = []

        entry = self._entries.get(item_id)
        if entry is not None:
            if entry.category == "block" and entry.tile_id is not None:
                _append_block_matches(world, entry.tile_id, matches)
            elif entry.category == "wall" and entry.wall_id is not None:
                _append_wall_matches(world, entry.wall_id, matches)
            elif entry.category == "object":
                _append_object_matches(world, entry, matches)

        if include_containers:
            for chest in world.chests:
                for ci in chest.items:
                    if ci.item_id != 0 and ci.item_id == item_id:
                        matches.append(
                            SearchMatch(
                                x=chest.x,
                                y=chest.y,
                                source="chest",
                                chest_id=chest.chest_id,
                                stack=ci.stack,
                            )
                        )

        matches.sort(key=lambda m: (m.y, m.x))
        result_tuple = tuple(matches)
        return SearchResult(
            item_id=item_id,
            total=len(result_tuple),
            matches=result_tuple,
        )


def _append_block_matches(
    world: World,
    tile_id_target: int,
    matches: list[SearchMatch],
) -> None:
    append = matches.append
    for x in range(world.tiles.width):
        col = world.tiles[x]
        for y, tile in enumerate(col):
            if tile.tile_id == tile_id_target:
                append(SearchMatch(x=x, y=y, source="block"))


def _append_wall_matches(
    world: World,
    wall_id_target: int,
    matches: list[SearchMatch],
) -> None:
    append = matches.append
    for x in range(world.tiles.width):
        col = world.tiles[x]
        for y, tile in enumerate(col):
            if tile.wall_id == wall_id_target:
                append(SearchMatch(x=x, y=y, source="wall"))


def _append_object_matches(
    world: World,
    entry: WorldMapEntry,
    matches: list[SearchMatch],
) -> None:
    tile_id_target = entry.tile_id
    if tile_id_target is None:
        return

    append = matches.append
    for x in range(world.tiles.width):
        col = world.tiles[x]
        for y, tile in enumerate(col):
            if tile.tile_id == tile_id_target and _is_object_frame_match(
                world, x, y, tile, entry
            ):
                append(SearchMatch(x=x, y=y, source="object"))


def _is_object_frame_match(
    world: World,
    x: int,
    y: int,
    tile: Tile,
    entry: WorldMapEntry,
) -> bool:
    if entry.frame_xy is not None:
        return (tile.frame_x, tile.frame_y) == entry.frame_xy
    return _is_object_top_left(world, x, y, tile)


def _is_object_top_left(world: World, x: int, y: int, tile: Tile) -> bool:
    frame_x = tile.frame_x
    frame_y = tile.frame_y
    tile_id = tile.tile_id
    if frame_x is None or frame_y is None or tile_id is None:
        return True

    has_left_part = _has_neighbor_frame(
        world=world,
        x=x - 1,
        y=y,
        tile_id=tile_id,
        frame_x=frame_x - _FRAME_STEP,
        frame_y=frame_y,
    )
    if has_left_part:
        return False

    return not _has_neighbor_frame(
        world=world,
        x=x,
        y=y - 1,
        tile_id=tile_id,
        frame_x=frame_x,
        frame_y=frame_y - _FRAME_STEP,
    )


def _has_neighbor_frame(
    world: World,
    x: int,
    y: int,
    tile_id: int,
    frame_x: int,
    frame_y: int,
) -> bool:
    if x < 0 or y < 0 or x >= world.tiles.width or y >= world.tiles.height:
        return False
    neighbor = world.tiles[x][y]
    return (
        neighbor.tile_id == tile_id
        and neighbor.frame_x == frame_x
        and neighbor.frame_y == frame_y
    )


def _load_default_mappings() -> ItemWorldMap:
    path = _DATA_DIR / "item_world_map.json"
    if not path.exists():
        raise ValueError(f"item_world_map file is missing: {path}")
    return load_item_world_map(path)


def _create_world_map_from_mappings(
    item_to_tile_mapping: Mapping[int, int] | None,
    item_to_wall_mapping: Mapping[int, int] | None,
    item_to_object_mapping: Mapping[int, int] | None,
    item_to_object_frame_mapping: Mapping[int, tuple[int, int]] | None,
) -> ItemWorldMap:
    entries: dict[int, WorldMapEntry] = {}

    for item_id, tile_id in (item_to_tile_mapping or {}).items():
        entries[item_id] = WorldMapEntry(category="block", tile_id=tile_id)
    for item_id, wall_id in (item_to_wall_mapping or {}).items():
        entries[item_id] = WorldMapEntry(category="wall", wall_id=wall_id)

    object_frame_mapping = dict(item_to_object_frame_mapping or {})
    for item_id, tile_id in (item_to_object_mapping or {}).items():
        entries[item_id] = WorldMapEntry(
            category="object",
            tile_id=tile_id,
            frame_xy=object_frame_mapping.pop(item_id, None),
        )

    if object_frame_mapping:
        item_ids = ", ".join(str(item_id) for item_id in sorted(object_frame_mapping))
        raise ValueError(
            f"object frame mappings without object tile mapping: {item_ids}"
        )

    return create_item_world_map(version="0.0.0", entries=entries)


def create_tile_search_engine(
    item_to_tile_mapping: Mapping[int, int] | None = None,
    item_to_wall_mapping: Mapping[int, int] | None = None,
    item_to_object_mapping: Mapping[int, int] | None = None,
    item_to_object_frame_mapping: Mapping[int, tuple[int, int]] | None = None,
) -> TileSearchEngine:
    if (
        item_to_tile_mapping is None
        and item_to_wall_mapping is None
        and item_to_object_mapping is None
        and item_to_object_frame_mapping is None
    ):
        item_world_map = _load_default_mappings()
    else:
        item_world_map = _create_world_map_from_mappings(
            item_to_tile_mapping=item_to_tile_mapping,
            item_to_wall_mapping=item_to_wall_mapping,
            item_to_object_mapping=item_to_object_mapping,
            item_to_object_frame_mapping=item_to_object_frame_mapping,
        )
    return _Engine(item_world_map)
