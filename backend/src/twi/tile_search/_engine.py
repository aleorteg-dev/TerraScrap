"""B4 – tile-search: engine implementation (pure domain, no FastAPI)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Protocol

from twi.tile_search._types import SearchMatch, SearchResult
from twi.wld_parser import World

_DATA_DIR = Path(__file__).parent / "data"


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
        item_to_tile_mapping: Mapping[int, int],
        item_to_wall_mapping: Mapping[int, int],
    ) -> None:
        self._tile_map: dict[int, int] = dict(item_to_tile_mapping)
        self._wall_map: dict[int, int] = dict(item_to_wall_mapping)

    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult:
        matches: list[SearchMatch] = []

        tile_id_target = self._tile_map.get(item_id)
        wall_id_target = self._wall_map.get(item_id)
        width = world.tiles.width

        _append = matches.append

        for x in range(width):
            col = world.tiles[x]
            for y, tile in enumerate(col):
                if tile_id_target is not None and tile.tile_id == tile_id_target:
                    _append(SearchMatch(x=x, y=y, source="block"))
                if wall_id_target is not None and tile.wall_id == wall_id_target:
                    _append(SearchMatch(x=x, y=y, source="wall"))

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


def _parse_int_map(section: object) -> dict[int, int]:
    if not isinstance(section, dict):
        return {}
    result: dict[int, int] = {}
    for k, v in section.items():
        if isinstance(k, str) and isinstance(v, int):
            result[int(k)] = v
    return result


def _load_default_mappings() -> tuple[dict[int, int], dict[int, int]]:
    path = _DATA_DIR / "item_world_map.json"
    if not path.exists():
        return {}, {}
    with path.open() as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        return {}, {}
    return _parse_int_map(raw.get("tiles")), _parse_int_map(raw.get("walls"))


def create_tile_search_engine(
    item_to_tile_mapping: Mapping[int, int] | None = None,
    item_to_wall_mapping: Mapping[int, int] | None = None,
) -> TileSearchEngine:
    tile_map: dict[int, int]
    wall_map: dict[int, int]
    if item_to_tile_mapping is None and item_to_wall_mapping is None:
        tile_map, wall_map = _load_default_mappings()
    else:
        tile_map = (
            dict(item_to_tile_mapping) if item_to_tile_mapping is not None else {}
        )
        wall_map = (
            dict(item_to_wall_mapping) if item_to_wall_mapping is not None else {}
        )
    return _Engine(tile_map, wall_map)
