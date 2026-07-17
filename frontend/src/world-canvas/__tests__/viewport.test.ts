import { describe, it, expect } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  clampZoom,
  zoomAroundCursor,
  visibleChunks,
  chunkSizeForZoom,
} from '../viewport';

describe('T-01 screenToWorld maps correctly at zoom=1 and no pan', () => {
  it('maps pixel (100,200) to world (100,200)', () => {
    const view = { panX: 0, panY: 0, zoom: 1 };
    expect(screenToWorld(100, 200, view)).toEqual({ x: 100, y: 200 });
  });

  it('maps pixel (0,0) to world (0,0)', () => {
    const view = { panX: 0, panY: 0, zoom: 1 };
    expect(screenToWorld(0, 0, view)).toEqual({ x: 0, y: 0 });
  });
});

describe('T-02 screenToWorld is inverse of worldToScreen', () => {
  it('roundtrip preserves coordinates at zoom=3 with pan', () => {
    const view = { panX: 5, panY: 10, zoom: 3 };
    const world = { x: 20, y: 30 };
    const screen = worldToScreen(world.x, world.y, view);
    const back = screenToWorld(screen.px, screen.py, view);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });

  it('roundtrip preserves coordinates at zoom=0.5', () => {
    const view = { panX: 100, panY: 50, zoom: 0.5 };
    const world = { x: 200, y: 150 };
    const screen = worldToScreen(world.x, world.y, view);
    const back = screenToWorld(screen.px, screen.py, view);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });
});

describe('T-03 zoom around cursor preserves the world coordinate under the cursor', () => {
  it('world point under cursor is unchanged after zoom in', () => {
    const view = { panX: 0, panY: 0, zoom: 2 };
    const cursorPx = 100;
    const cursorPy = 80;
    const worldBefore = screenToWorld(cursorPx, cursorPy, view);
    const newView = zoomAroundCursor(cursorPx, cursorPy, 4, view);
    const worldAfter = screenToWorld(cursorPx, cursorPy, newView);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it('world point under cursor is unchanged after zoom out', () => {
    const view = { panX: 50, panY: 30, zoom: 4 };
    const cursorPx = 200;
    const cursorPy = 150;
    const worldBefore = screenToWorld(cursorPx, cursorPy, view);
    const newView = zoomAroundCursor(cursorPx, cursorPy, 1, view);
    const worldAfter = screenToWorld(cursorPx, cursorPy, newView);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });
});

describe('T-04 clampZoom respects min/max', () => {
  it('clamps below min', () => {
    expect(clampZoom(0.05, 0.1, 32)).toBe(0.1);
  });

  it('clamps above max', () => {
    expect(clampZoom(64, 0.1, 32)).toBe(32);
  });

  it('keeps value within range unchanged', () => {
    expect(clampZoom(4, 0.1, 32)).toBe(4);
  });
});

describe('T-05 visibleChunks returns only chunks intersecting viewport', () => {
  it('returns chunk (0,0) when viewport starts at origin', () => {
    const view = { panX: 0, panY: 0, zoom: 2 };
    const chunks = visibleChunks(view, 256, 256, 8400, 2400, 128);
    expect(chunks).toContainEqual({ cx: 0, cy: 0 });
  });

  it('does not return far-away chunks', () => {
    const view = { panX: 0, panY: 0, zoom: 2 };
    // 256×256 canvas at zoom=2 → 128×128 tiles visible → only chunk (0,0)
    const chunks = visibleChunks(view, 256, 256, 8400, 2400, 128);
    expect(chunks).not.toContainEqual({ cx: 5, cy: 5 });
  });

  it('does not include chunks with negative indices even with negative pan', () => {
    const view = { panX: -200, panY: -200, zoom: 1 };
    const chunks = visibleChunks(view, 100, 100, 8400, 2400, 128);
    for (const { cx, cy } of chunks) {
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cy).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not include chunks beyond world bounds', () => {
    const view = { panX: 8000, panY: 2000, zoom: 1 };
    const chunks = visibleChunks(view, 800, 600, 8400, 2400, 128);
    const maxCX = Math.ceil(8400 / 128) - 1;
    const maxCY = Math.ceil(2400 / 128) - 1;
    for (const { cx, cy } of chunks) {
      expect(cx).toBeLessThanOrEqual(maxCX);
      expect(cy).toBeLessThanOrEqual(maxCY);
    }
  });
});

describe('T-25 chunkSizeForZoom picks the chunk size for the current zoom', () => {
  it('should return 128 for zoom >= 1', () => {
    expect(chunkSizeForZoom(1)).toBe(128);
    expect(chunkSizeForZoom(2)).toBe(128);
    expect(chunkSizeForZoom(8)).toBe(128);
  });

  it('should return 256 for 0.5 < zoom < 1', () => {
    expect(chunkSizeForZoom(0.99)).toBe(256);
    expect(chunkSizeForZoom(0.75)).toBe(256);
    expect(chunkSizeForZoom(0.51)).toBe(256);
  });

  it('should return 512 for zoom <= 0.5', () => {
    expect(chunkSizeForZoom(0.5)).toBe(512);
    expect(chunkSizeForZoom(0.25)).toBe(512);
    expect(chunkSizeForZoom(0.095)).toBe(512);
  });
});
