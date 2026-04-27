import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChunkBitmapCache, renderChunkBitmap } from '../chunkBitmapCache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderChunkBitmap', () => {
  it('T-C1 should return HTMLCanvasElement sized chunkSize×chunkSize', () => {
    const tiles = new Int16Array(4 * 4).fill(-1);
    const result = renderChunkBitmap('w1', 0, 0, tiles, 4);
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.width).toBe(4);
    expect(result.canvas.height).toBe(4);
    expect(result.worldId).toBe('w1');
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
  });

  it('T-C2 should call fillRect for non-air tiles', () => {
    // 2×2 chunk: tiles at (0,0) and (0,1) are non-air; (1,0) and (1,1) are air
    const tiles = new Int16Array(4);
    tiles[0] = 1; // tx=0, ty=0 — Stone
    tiles[1] = -1; // tx=1, ty=0 — air
    tiles[2] = 2; // tx=0, ty=1 — Grass
    tiles[3] = -1; // tx=1, ty=1 — air
    renderChunkBitmap('w1', 0, 0, tiles, 2);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('T-C3 should not call fillRect for air tiles (tileId < 0)', () => {
    const tiles = new Int16Array(2 * 2).fill(-1);
    renderChunkBitmap('w1', 0, 0, tiles, 2);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('T-C4 should use correct pixel coordinates (tx, ty, 1, 1) for each tile', () => {
    const tiles = new Int16Array(2 * 2).fill(1); // all Stone
    renderChunkBitmap('w1', 3, 7, tiles, 2);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 0, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 1, 1, 1);
  });
});

describe('createChunkBitmapCache', () => {
  it('T-C5 should return undefined for missing key', () => {
    const cache = createChunkBitmapCache();
    expect(cache.get('w1', 0, 0)).toBeUndefined();
  });

  it('T-C6 should retrieve a stored RenderedChunk by worldId, cx, cy', () => {
    const cache = createChunkBitmapCache();
    const chunk = {
      canvas: document.createElement('canvas'),
      worldId: 'w1',
      cx: 3,
      cy: 7,
    };
    cache.set(chunk);
    expect(cache.get('w1', 3, 7)).toBe(chunk);
    expect(cache.get('w1', 3, 8)).toBeUndefined();
    expect(cache.get('w2', 3, 7)).toBeUndefined();
  });

  it('T-C7 clearWorld should remove only chunks for that worldId', () => {
    const cache = createChunkBitmapCache();
    const mkChunk = (worldId: string, cx: number, cy: number) => ({
      canvas: document.createElement('canvas'),
      worldId,
      cx,
      cy,
    });
    cache.set(mkChunk('w1', 0, 0));
    cache.set(mkChunk('w1', 1, 0));
    cache.set(mkChunk('w2', 0, 0));
    cache.clearWorld('w1');
    expect(cache.get('w1', 0, 0)).toBeUndefined();
    expect(cache.get('w1', 1, 0)).toBeUndefined();
    expect(cache.get('w2', 0, 0)).toBeDefined();
    expect(cache.size()).toBe(1);
  });

  it('T-C8 size should reflect cache count after set and clearWorld', () => {
    const cache = createChunkBitmapCache();
    expect(cache.size()).toBe(0);
    cache.set({ canvas: document.createElement('canvas'), worldId: 'w1', cx: 0, cy: 0 });
    expect(cache.size()).toBe(1);
    cache.set({ canvas: document.createElement('canvas'), worldId: 'w1', cx: 1, cy: 0 });
    expect(cache.size()).toBe(2);
    cache.clearWorld('w1');
    expect(cache.size()).toBe(0);
  });
});
