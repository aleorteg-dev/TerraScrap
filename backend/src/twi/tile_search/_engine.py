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

    def __init__(self, item_to_tile_mapping: Mapping[int, int]) -> None:
        self._mapping: dict[int, int] = dict(item_to_tile_mapping)

    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult:
        matches: list[SearchMatch] = []

        tile_id_target = self._mapping.get(item_id)
        width = world.tiles.width

        # Single O(W·H) pass — collect block and wall matches simultaneously.
        # Cache matches.append to avoid repeated attribute lookup in inner loop.
        _append = matches.append

        if tile_id_target is not None:
            # SP-01 + SP-02: check both block and wall in one pass.
            for x in range(width):
                col = world.tiles[x]
                for y, tile in enumerate(col):
                    if tile.tile_id == tile_id_target:
                        _append(SearchMatch(x=x, y=y, source="block"))
                    if tile.wall_id == item_id:
                        _append(SearchMatch(x=x, y=y, source="wall"))
        else:
            # SP-02 only: no block mapping for this item_id.
            for x in range(width):
                col = world.tiles[x]
                for y, tile in enumerate(col):
                    if tile.wall_id == item_id:
                        _append(SearchMatch(x=x, y=y, source="wall"))

        # SP-03 / SP-04: chest / container matches.
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

        # Consistent ordering (y, x) so the frontend receives a stable list.
        matches.sort(key=lambda m: (m.y, m.x))
        result_tuple = tuple(matches)
        return SearchResult(
            item_id=item_id,
            total=len(result_tuple),
            matches=result_tuple,
        )


def _load_default_mapping() -> dict[int, int]:
    path = _DATA_DIR / "item_tile_map.json"
    if not path.exists():
        return {}
    with path.open() as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        return {}
    result: dict[int, int] = {}
    for k, v in raw.items():
        if isinstance(k, str) and isinstance(v, int):
            result[int(k)] = v
    return result


def create_tile_search_engine(
    item_to_tile_mapping: Mapping[int, int] | None = None,
) -> TileSearchEngine:
    mapping = (
        item_to_tile_mapping
        if item_to_tile_mapping is not None
        else _load_default_mapping()
    )
    return _Engine(mapping)
