"""CLI helper: regenerate the bundled seed catalog from wiki.gg.

Usage:
    python -m twi.item_catalog.refresh [--output PATH]

Default output: the bundled seed at item_catalog/data/items.seed.json.
"""

import argparse
import asyncio
import logging
from pathlib import Path

import httpx

from twi.item_catalog.scraper import refresh_cache_from_wiki

_DEFAULT_SEED = Path(__file__).parent / "data" / "items.seed.json"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
_log = logging.getLogger(__name__)


async def _run(output: Path) -> None:
    _log.info("Fetching item catalog from wiki.gg...")
    async with httpx.AsyncClient(
        timeout=60,
        headers={"User-Agent": "TerraScrap/1.0 contact:alejandreitor2004@gmail.com"},
        follow_redirects=True,
    ) as client:
        await refresh_cache_from_wiki(output, client)
    import json

    data = json.loads(output.read_text(encoding="utf-8"))
    count = len(data.get("items", []))
    _log.info("Written %d items to %s", count, output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate bundled item seed.")
    parser.add_argument(
        "--output",
        type=Path,
        default=_DEFAULT_SEED,
        help="Output path (default: bundled seed)",
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    asyncio.run(_run(args.output))


if __name__ == "__main__":
    main()
