"""Pydantic v2 DTOs for B5 – api-rest."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel

ErrorDetails = Mapping[str, object] | list[Mapping[str, object]]


class WorldMetadataDto(BaseModel):
    name: str
    width: int
    height: int
    version: int
    seed: str
    size: Literal["small", "medium", "large"]
    hardmode: bool
    spawn_x: int
    spawn_y: int
    world_surface_y: float
    rock_layer_y: float
    hell_layer_y: float


class WorldCreatedDto(BaseModel):
    world_id: str
    metadata: WorldMetadataDto


TilesEncoding = Literal["base64-rle-v1", "base64-rle-v2"]


class TilesChunkDto(BaseModel):
    chunk_x: int
    chunk_y: int
    width: int
    height: int
    encoding: TilesEncoding
    payload: str


class NpcDto(BaseModel):
    id: int
    name: str
    type: Literal["town", "banner"]
    x: int
    y: int


class NpcListDto(BaseModel):
    npcs: list[NpcDto]


class TileEntityDto(BaseModel):
    id: int
    type: Literal["item_frame", "weapon_rack", "mannequin", "hat_rack", "plate"]
    x: int
    y: int


class TileDetailDto(BaseModel):
    x: int
    y: int
    tile_id: int | None
    wall_id: int | None
    liquid_type: Literal["none", "water", "lava", "honey", "shimmer"]
    liquid_amount: int
    frame_x: int | None = None
    frame_y: int | None = None
    chest_id: int | None = None
    sign_id: int | None = None
    tile_entity_id: int | None = None


class SearchMatchDto(BaseModel):
    x: int
    y: int
    source: Literal["block", "wall", "chest", "object"]
    chest_id: int | None = None
    stack: int | None = None


class SearchResultDto(BaseModel):
    item_id: int
    total: int
    matches: list[SearchMatchDto]


class ItemSummaryDto(BaseModel):
    id: int
    name: str
    sprite_url: str
    category: str


class ItemDetailDto(BaseModel):
    id: int
    name: str
    sprite_url: str
    category: str
    rarity: int


class ItemListDto(BaseModel):
    items: list[ItemSummaryDto]


class ErrorDetailDto(BaseModel):
    code: str
    message: str
    details: ErrorDetails | None = None


class ErrorDto(BaseModel):
    error: ErrorDetailDto
