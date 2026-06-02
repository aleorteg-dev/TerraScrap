"""B4 - tile-search: engine implementation (pure domain, no FastAPI)."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Protocol

from twi.tile_search._mapping import (
    SCHEMA_VERSION,
    ItemMatcher,
    ItemWorldMap,
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

    def __init__(self, item_world_map: ItemWorldMap) -> None:
        self._entries: dict[int, tuple[ItemMatcher, ...]] = dict(item_world_map.entries)

    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult:
        matches: list[SearchMatch] = []

        matchers = self._entries.get(item_id, ())
        block_targets: set[int] = set()
        wall_targets: set[int] = set()
        object_matchers: list[ItemMatcher] = []
        for matcher in matchers:
            if matcher.category == "block" and matcher.tile_id is not None:
                block_targets.add(matcher.tile_id)
            elif matcher.category == "wall":
                wall_targets.update(matcher.wall_ids)
            elif matcher.category == "object":
                object_matchers.append(matcher)

        if block_targets or wall_targets:
            _scan_blocks_and_walls(world, block_targets, wall_targets, matches)

        for matcher in object_matchers:
            _append_object_matches(world, matcher, matches)

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
            _append_tile_entity_matches(world, item_id, matches)

        matches.sort(key=lambda m: (m.y, m.x))
        result_tuple = tuple(matches)
        return SearchResult(
            item_id=item_id,
            total=len(result_tuple),
            matches=result_tuple,
        )


_TILE_ENTITY_ITEM_KEY_PREFIXES: tuple[str, ...] = ("item_", "dye_", "misc_")


def _append_tile_entity_matches(
    world: World,
    item_id: int,
    matches: list[SearchMatch],
) -> None:
    for entity in world.tile_entities:
        stack: int | None = None
        found = False
        for key, value in entity.data.items():
            if not isinstance(value, int) or value != item_id:
                continue
            if not key.endswith("_id"):
                continue
            if not key.startswith(_TILE_ENTITY_ITEM_KEY_PREFIXES):
                continue
            found = True
            stack_key = key[:-3] + "_stack"
            stack_value = entity.data.get(stack_key)
            if not isinstance(stack_value, int):
                stack_value = entity.data.get("stack")
            if isinstance(stack_value, int):
                stack = stack_value
            break
        if found:
            matches.append(
                SearchMatch(
                    x=entity.x,
                    y=entity.y,
                    source="object",
                    stack=stack,
                )
            )


def _scan_blocks_and_walls(
    world: World,
    block_targets: set[int],
    wall_targets: set[int],
    matches: list[SearchMatch],
) -> None:
    append = matches.append
    for tile_id in block_targets:
        for x, y in world.tiles.iter_tile_positions(tile_id):
            append(SearchMatch(x=x, y=y, source="block"))
    for wall_id in wall_targets:
        for x, y in world.tiles.iter_wall_positions(wall_id):
            append(SearchMatch(x=x, y=y, source="wall"))


def _append_object_matches(
    world: World,
    matcher: ItemMatcher,
    matches: list[SearchMatch],
) -> None:
    tile_id_target = matcher.tile_id
    if tile_id_target is None:
        return
    target_frames: set[tuple[int, int]] | None = (
        set(matcher.frame_xys) if matcher.frame_xys else None
    )
    append = matches.append
    for x, y in world.tiles.iter_tile_positions(tile_id_target):
        tile = world.tiles[x][y]
        if _is_object_match(world, x, y, tile, target_frames):
            append(SearchMatch(x=x, y=y, source="object"))


def _is_object_match(
    world: World,
    x: int,
    y: int,
    tile: Tile,
    target_frames: set[tuple[int, int]] | None,
) -> bool:
    if target_frames is not None:
        return (tile.frame_x, tile.frame_y) in target_frames
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
    entries: dict[int, tuple[ItemMatcher, ...]] = {}

    for item_id, tile_id in (item_to_tile_mapping or {}).items():
        entries[item_id] = (ItemMatcher(category="block", tile_id=tile_id),)
    for item_id, wall_id in (item_to_wall_mapping or {}).items():
        entries[item_id] = (ItemMatcher(category="wall", wall_ids=(wall_id,)),)

    object_frame_mapping = dict(item_to_object_frame_mapping or {})
    for item_id, tile_id in (item_to_object_mapping or {}).items():
        frame = object_frame_mapping.pop(item_id, None)
        frame_xys: tuple[tuple[int, int], ...] = (frame,) if frame is not None else ()
        entries[item_id] = (
            ItemMatcher(category="object", tile_id=tile_id, frame_xys=frame_xys),
        )

    if object_frame_mapping:
        item_ids = ", ".join(str(item_id) for item_id in sorted(object_frame_mapping))
        raise ValueError(
            f"object frame mappings without object tile mapping: {item_ids}"
        )

    return create_item_world_map(schema_version=SCHEMA_VERSION, entries=entries)


def create_tile_search_engine(
    item_to_tile_mapping: Mapping[int, int] | None = None,
    item_to_wall_mapping: Mapping[int, int] | None = None,
    item_to_object_mapping: Mapping[int, int] | None = None,
    item_to_object_frame_mapping: Mapping[int, tuple[int, int]] | None = None,
    world_map_path: Path | None = None,
) -> TileSearchEngine:
    if world_map_path is not None:
        return _Engine(load_item_world_map(world_map_path))
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
