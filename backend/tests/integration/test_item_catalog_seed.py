"""Integration: /api/items returns results from bundled seed on first run."""

from pathlib import Path

from fastapi.testclient import TestClient

from twi.app import Settings, create_app


def test_items_query_dirt_returns_results_from_seed(tmp_path: Path) -> None:
    settings = Settings(item_cache_path=tmp_path / "nonexistent_items.json")
    client = TestClient(create_app(settings))
    resp = client.get("/api/items?q=dirt")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert any("dirt" in item["name"].lower() for item in items)


def test_items_query_empty_returns_all_seed_items(tmp_path: Path) -> None:
    settings = Settings(item_cache_path=tmp_path / "nonexistent_items.json")
    client = TestClient(create_app(settings))
    resp = client.get("/api/items?q=")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1
