"""Domain types for B1 – wld-parser."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
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


class TileGrid:
    """Read-only tile grid, indexable as grid[x][y]."""

    __slots__ = ("_columns", "_width", "_height")

    def __init__(self, columns: list[list[Tile]]) -> None:
        self._columns = columns
        self._width = len(columns)
        self._height = len(columns[0]) if columns else 0

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    def __getitem__(self, x: int) -> Sequence[Tile]:
        return self._columns[x]

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, TileGrid):
            return NotImplemented
        return self._columns == other._columns

    def __hash__(self) -> int:
        return hash(tuple(tuple(col) for col in self._columns))


@dataclass(frozen=True)
class World:
    metadata: WorldMetadata
    tiles: TileGrid
    chests: tuple[Chest, ...]
    signs: tuple[Sign, ...]
