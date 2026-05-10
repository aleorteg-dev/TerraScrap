"""CLI helper: regenerate the bundled seed catalog from wiki.gg.

Usage:
    python -m twi.item_catalog.refresh [--output PATH] [--enrich]

Default output: bundled versioned seed at item_catalog/data/items_seed.v2.json.
Idempotent: if scraping fails (wiki unavailable / schema changed), the existing
seed file is left untouched and the process exits with non-zero status.
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

import httpx

from twi.item_catalog.scraper import (
    WikiSchemaChangedError,
    WikiUnavailableError,
    refresh_cache_from_wiki,
)

_SEED_VERSION: int = 2
_DATA_DIR = Path(__file__).parent / "data"
_DEFAULT_SEED = _DATA_DIR / f"items_seed.v{_SEED_VERSION}.json"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
_log = logging.getLogger(__name__)


async def _run(output: Path, *, enrich: bool = False) -> None:
    _log.info("Fetching item catalog from wiki.gg (enrich=%s)...", enrich)
    async with httpx.AsyncClient(
        timeout=60,
        headers={"User-Agent": "TerraScrap/1.0 contact:alejandreitor2004@gmail.com"},
        follow_redirects=True,
    ) as client:
        await refresh_cache_from_wiki(output, client, enrich=enrich)

    data = json.loads(output.read_text(encoding="utf-8"))
    count = len(data.get("items", []))
    _log.info("Written %d items (schema=%s) to %s", count, data.get("schema"), output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate bundled item seed.")
    parser.add_argument(
        "--output",
        type=Path,
        default=_DEFAULT_SEED,
        help=f"Output path (default: bundled v{_SEED_VERSION} seed)",
    )
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Fetch per-item pages to enrich sprite/category/rarity/tooltip",
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        asyncio.run(_run(args.output, enrich=args.enrich))
    except (WikiUnavailableError, WikiSchemaChangedError) as exc:
        _log.error("Refresh aborted, existing seed preserved: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
