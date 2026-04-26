"""Tests for B6 – app-bootstrap (TDD red → green)."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from twi.app import Settings, create_app

# ── helpers ─────────────────────────────────────────────────────────────────


def _client(settings: Settings | None = None) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=False)


# ── T-01 ─────────────────────────────────────────────────────────────────────


def test_create_app_returns_fastapi_with_routes_mounted() -> None:
    app = create_app()
    assert isinstance(app, FastAPI)
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/worlds" in paths
    assert "/healthz" in paths


# ── T-02 ─────────────────────────────────────────────────────────────────────


def test_healthz_returns_ok() -> None:
    resp = _client().get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── T-03 ─────────────────────────────────────────────────────────────────────


def test_cors_header_on_allowed_origin() -> None:
    settings = Settings(cors_origins=["http://allowed.local"])
    resp = _client(settings).get("/healthz", headers={"Origin": "http://allowed.local"})
    assert resp.headers.get("access-control-allow-origin") == "http://allowed.local"


# ── T-04 ─────────────────────────────────────────────────────────────────────


def test_cors_header_absent_on_disallowed_origin() -> None:
    settings = Settings(cors_origins=["http://allowed.local"])
    resp = _client(settings).get(
        "/healthz", headers={"Origin": "http://evil.example.com"}
    )
    assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"


# ── T-05 ─────────────────────────────────────────────────────────────────────


def test_upload_size_middleware_returns_413_over_limit() -> None:
    settings = Settings(max_upload_mb=1)
    big = b"x" * (2 * 1024 * 1024)  # 2 MB > 1 MB limit
    resp = _client(settings).post(
        "/api/worlds",
        content=big,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert resp.status_code == 413


# ── T-06 ─────────────────────────────────────────────────────────────────────


def test_purge_task_runs_on_schedule() -> None:
    mock_repo = MagicMock()
    mock_repo.purge_expired.return_value = 0

    settings = Settings(purge_interval_seconds=0)

    with patch("twi.app.create_in_memory_repository", return_value=mock_repo):
        app = create_app(settings)
        with TestClient(app):
            time.sleep(0.05)  # allow at least one purge cycle

    mock_repo.purge_expired.assert_called()
