"""Wiki scraper — fetches item data from wiki.gg and writes versioned cache."""

import json
from pathlib import Path
from typing import Any, Protocol

import httpx
from bs4 import BeautifulSoup, Tag

_WIKI_ITEMS_URL = "https://terraria.wiki.gg/wiki/Item_IDs"
_CACHE_SCHEMA: int = 1


class HttpClient(Protocol):
    async def get(self, url: str) -> httpx.Response: ...


async def refresh_cache_from_wiki(cache_path: Path, client: HttpClient) -> None:
    """Fetch the item list from the wiki and persist it as a versioned JSON cache."""
    response = await client.get(_WIKI_ITEMS_URL)
    response.raise_for_status()
    items = _parse_items_page(response.text)
    payload: dict[str, Any] = {"schema": _CACHE_SCHEMA, "items": items}
    cache_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _find_items_table(soup: BeautifulSoup) -> Tag | None:
    """Find the main items table, tolerating wiki CSS class changes."""
    for cls in ("terraria", "wikitable"):
        table = soup.find("table", class_=cls)
        if isinstance(table, Tag):
            return table
    # Last resort: first table inside main content
    content = soup.find(id="mw-content-text")
    if isinstance(content, Tag):
        table = content.find("table")
        if isinstance(table, Tag):
            return table
    return None


def _parse_items_page(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = _find_items_table(soup)
    if table is None:
        return []

    items: list[dict[str, Any]] = []
    rows = table.find_all("tr")
    for row in rows[1:]:  # skip header
        if not isinstance(row, Tag):
            continue
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        id_text = cells[0].get_text(strip=True)
        if not id_text.isdigit():
            continue
        item_id = int(id_text)

        name_cell = cells[1]
        link = name_cell.find("a")
        name = (
            link.get_text(strip=True)
            if isinstance(link, Tag)
            else name_cell.get_text(strip=True)
        )
        if not name:
            continue

        items.append(
            {
                "id": item_id,
                "name": name,
                "sprite_url": "",
                "category": "",
                "rarity": 0,
                "tooltip": None,
            }
        )

    return items
