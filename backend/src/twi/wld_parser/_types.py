"""Domain types for B1 – wld-parser."""

from __future__ import annotations

from array import array
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class WorldMetadata:
    name: str
    width: int
    height: int
    version: int
    seed: str
    size: Literal["small", "medium", "large"]
    hardmode: bool
    # Spawn + layer fields (v0.2 contract). Default 0/0.0 keeps backward
    # compatibility with fixtures in other modules that don't set them.
    spawn_x: int = 0
    spawn_y: int = 0
    world_surface_y: float = 0.0
    rock_layer_y: float = 0.0
    hell_layer_y: float = 0.0


@dataclass(frozen=True)
class Tile:
    tile_id: int | None  # None = air
    wall_id: int | None
    liquid_type: Literal["none", "water", "lava", "honey", "shimmer"]
    liquid_amount: int  # 0..255; 0 when liquid_type == "none"
    flags: int  # raw bitmask for wires / slope / actuator
    frame_x: int | None = None  # U; only set when tfi[tile_id] is true
    frame_y: int | None = None  # V; forced to 0 when tile_id == 144 (Timers)


@dataclass(frozen=True)
class ChestItem:
    item_id: int
    stack: int
    prefix: int


@dataclass(frozen=True)
class Chest:
    chest_id: int
    x: int
    y: int
    name: str
    items: tuple[ChestItem, ...]  # always 40 slots; empty slots = ChestItem(0,0,0)


@dataclass(frozen=True)
class Sign:
    x: int
    y: int
    text: str


@dataclass(frozen=True)
class Npc:
    id: int
    name: str
    position_x: float
    position_y: float
    is_homeless: bool
    home_x: int
    home_y: int
    is_town_npc: bool


class TileGrid:
    """Read-only tile grid, indexable as grid[x][y]."""

    __slots__ = ("_columns", "_height", "_tile_positions", "_wall_positions", "_width")

    def __init__(self, columns: list[list[Tile]]) -> None:
        self._columns = columns
        self._width = len(columns)
        self._height = len(columns[0]) if columns else 0
        self._tile_positions: dict[int, array[int]] = {}
        self._wall_positions: dict[int, array[int]] = {}
        self._build_position_indexes()

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    def __getitem__(self, x: int) -> Sequence[Tile]:
        return self._columns[x]

    def iter_tile_positions(self, tile_id: int) -> Iterator[tuple[int, int]]:
        yield from self._iter_positions(self._tile_positions.get(tile_id))

    def iter_wall_positions(self, wall_id: int) -> Iterator[tuple[int, int]]:
        yield from self._iter_positions(self._wall_positions.get(wall_id))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, TileGrid):
            return NotImplemented
        return self._columns == other._columns

    def __hash__(self) -> int:
        return hash(tuple(tuple(col) for col in self._columns))

    def _build_position_indexes(self) -> None:
        height = self._height
        for x, col in enumerate(self._columns):
            for y, tile in enumerate(col):
                encoded = x * height + y
                tile_id = tile.tile_id
                if tile_id is not None:
                    self._tile_positions.setdefault(tile_id, array("I")).append(encoded)
                wall_id = tile.wall_id
                if wall_id is not None:
                    self._wall_positions.setdefault(wall_id, array("I")).append(encoded)

    def _iter_positions(
        self, positions: array[int] | None
    ) -> Iterator[tuple[int, int]]:
        if positions is None:
            return
        height = self._height
        for encoded in positions:
            yield divmod(encoded, height)


@dataclass(frozen=True)
class TileEntity:
    id: int
    entity_type: int
    x: int
    y: int
    data: dict[str, int | str]


@dataclass(frozen=True)
class World:
    metadata: WorldMetadata
    tiles: TileGrid
    chests: tuple[Chest, ...]
    signs: tuple[Sign, ...]
    npcs: list[Npc] = field(default_factory=list)
    tile_entities: list[TileEntity] = field(default_factory=list)
