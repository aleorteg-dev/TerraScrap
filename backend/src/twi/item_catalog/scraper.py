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


def _parse_items_page(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", attrs={"class": "wikitable"})
    if not isinstance(table, Tag):
        return []

    items: list[dict[str, Any]] = []
    rows = table.find_all("tr")
    for row in rows[1:]:  # skip header
        if not isinstance(row, Tag):
            continue
        cells = row.find_all("td")
        if len(cells) < 4:
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

        img = name_cell.find("img")
        sprite_url = ""
        if isinstance(img, Tag):
            src = img.get("src", "")
            if isinstance(src, list):
                sprite_url = src[0] if src else ""
            elif isinstance(src, str):
                sprite_url = src

        category = cells[2].get_text(strip=True).lower()

        rarity_text = cells[3].get_text(strip=True)
        try:
            rarity = int(rarity_text)
        except ValueError:
            rarity = 0

        tooltip_raw = cells[4].get_text(strip=True) if len(cells) > 4 else ""
        tooltip: str | None = tooltip_raw if tooltip_raw else None

        items.append(
            {
                "id": item_id,
                "name": name,
                "sprite_url": sprite_url,
                "category": category,
                "rarity": rarity,
                "tooltip": tooltip,
            }
        )

    return items
