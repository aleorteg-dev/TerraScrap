"""Pydantic v2 DTOs for B5 – api-rest."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel


class WorldMetadataDto(BaseModel):
    name: str
    width: int
    height: int
    version: int
    seed: str
    size: Literal["small", "medium", "large"]
    hardmode: bool


class WorldCreatedDto(BaseModel):
    world_id: str
    metadata: WorldMetadataDto


class TilesChunkDto(BaseModel):
    chunk_x: int
    chunk_y: int
    width: int
    height: int
    encoding: Literal["base64-rle-v1"]
    payload: str


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
    details: Mapping[str, object] | None = None


class ErrorDto(BaseModel):
    error: ErrorDetailDto
