"""Public contract for B4 – tile-search."""

from twi.tile_search._engine import TileSearchEngine, create_tile_search_engine
from twi.tile_search._types import SearchMatch, SearchResult

__all__ = [
    "SearchMatch",
    "SearchResult",
    "TileSearchEngine",
    "create_tile_search_engine",
]
