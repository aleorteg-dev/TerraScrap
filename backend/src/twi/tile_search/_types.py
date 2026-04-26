"""Domain types for B4 – tile-search."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class SearchMatch:
    x: int
    y: int
    source: Literal["block", "wall", "chest", "object"]
    chest_id: int | None = None
    stack: int | None = None


@dataclass(frozen=True)
class SearchResult:
    item_id: int
    total: int
    matches: tuple[SearchMatch, ...]
