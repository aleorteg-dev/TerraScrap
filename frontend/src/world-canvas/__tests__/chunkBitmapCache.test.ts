import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createChunkBitmapCache,
  renderChunkBitmap,
  renderChunkBitmapV2,
} from '../chunkBitmapCache';
import type { DecodedChunkV2 } from '../rleDecoder';
import { getTileColor } from '../tileColors';
import { getWallColor, getLiquidColor } from '../tileColors';

const REALISTIC_WORLD_WIDTH = 8400;
const REALISTIC_WORLD_HEIGHT = 2400;
const REALISTIC_CHUNK_SIZE = 256;
const RIGHT_EDGE_CX = Math.ceil(REALISTIC_WORLD_WIDTH / REALISTIC_CHUNK_SIZE) - 1;
const BOTTOM_EDGE_CY = Math.ceil(REALISTIC_WORLD_HEIGHT / REALISTIC_CHUNK_SIZE) - 1;
const RIGHT_EDGE_WIDTH = REALISTIC_WORLD_WIDTH - RIGHT_EDGE_CX * REALISTIC_CHUNK_SIZE;
const BOTTOM_EDGE_HEIGHT = REALISTIC_WORLD_HEIGHT - BOTTOM_EDGE_CY * REALISTIC_CHUNK_SIZE;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderChunkBitmap', () => {
  it('T-C1 should return HTMLCanvasElement sized chunkSize by chunkSize for full chunks', () => {
    const tiles = new Int16Array(4 * 4).fill(-1);
    const result = renderChunkBitmap('w1', 0, 0, tiles, 4, 8, 8);
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.width).toBe(4);
    expect(result.canvas.height).toBe(4);
    expect(result.worldId).toBe('w1');
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
  });

  it('T-C2 should call fillRect for non-air tiles', () => {
    // 2 by 2 chunk: tiles at (0,0) and (0,1) are non-air; the others are air.
    const tiles = new Int16Array(4);
    tiles[0] = 1; // tx=0, ty=0, Stone
    tiles[1] = -1; // tx=1, ty=0, air
    tiles[2] = 2; // tx=0, ty=1, Grass
    tiles[3] = -1; // tx=1, ty=1, air
    renderChunkBitmap('w1', 0, 0, tiles, 2, 4, 4);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('T-C3 should not call fillRect for air tiles (tileId < 0)', () => {
    const tiles = new Int16Array(2 * 2).fill(-1);
    renderChunkBitmap('w1', 0, 0, tiles, 2, 4, 4);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('T-C4 should use correct pixel coordinates (tx, ty, 1, 1) for each tile', () => {
    const tiles = new Int16Array(2 * 2).fill(1);
    renderChunkBitmap('w1', 3, 7, tiles, 2, 8, 16);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 0, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 1, 1);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 1, 1, 1);
  });

  it('T-C9 should size right-edge chunk bitmap to clipped world width', () => {
    const tiles = new Int16Array(RIGHT_EDGE_WIDTH * REALISTIC_CHUNK_SIZE).fill(-1);
    const result = renderChunkBitmap(
      'w1',
      RIGHT_EDGE_CX,
      0,
      tiles,
      REALISTIC_CHUNK_SIZE,
      REALISTIC_WORLD_WIDTH,
      REALISTIC_WORLD_HEIGHT
    );
    expect(result.canvas.width).toBe(RIGHT_EDGE_WIDTH);
    expect(result.canvas.height).toBe(REALISTIC_CHUNK_SIZE);
  });

  it('T-C10 should size bottom-edge chunk bitmap to clipped world height', () => {
    const tiles = new Int16Array(REALISTIC_CHUNK_SIZE * BOTTOM_EDGE_HEIGHT).fill(-1);
    const result = renderChunkBitmap(
      'w1',
      0,
      BOTTOM_EDGE_CY,
      tiles,
      REALISTIC_CHUNK_SIZE,
      REALISTIC_WORLD_WIDTH,
      REALISTIC_WORLD_HEIGHT
    );
    expect(result.canvas.width).toBe(REALISTIC_CHUNK_SIZE);
    expect(result.canvas.height).toBe(BOTTOM_EDGE_HEIGHT);
  });

  it('T-C11 should size bottom-right chunk bitmap to both clipped dimensions', () => {
    const tiles = new Int16Array(RIGHT_EDGE_WIDTH * BOTTOM_EDGE_HEIGHT).fill(-1);
    const result = renderChunkBitmap(
      'w1',
      RIGHT_EDGE_CX,
      BOTTOM_EDGE_CY,
      tiles,
      REALISTIC_CHUNK_SIZE,
      REALISTIC_WORLD_WIDTH,
      REALISTIC_WORLD_HEIGHT
    );
    expect(result.canvas.width).toBe(RIGHT_EDGE_WIDTH);
    expect(result.canvas.height).toBe(BOTTOM_EDGE_HEIGHT);
  });

  it('T-C12 should keep full chunk dimensions when world dimensions are multiples of chunkSize', () => {
    const tiles = new Int16Array(REALISTIC_CHUNK_SIZE * REALISTIC_CHUNK_SIZE).fill(-1);
    const result = renderChunkBitmap('w1', 31, 8, tiles, REALISTIC_CHUNK_SIZE, 8192, 2304);
    expect(result.canvas.width).toBe(REALISTIC_CHUNK_SIZE);
    expect(result.canvas.height).toBe(REALISTIC_CHUNK_SIZE);
  });

  it('T-C13 should use clipped width as row stride for partial chunks', () => {
    const clippedHeight = 2;
    const tiles = new Int16Array(RIGHT_EDGE_WIDTH * clippedHeight).fill(-1);
    tiles[RIGHT_EDGE_WIDTH] = 1;
    renderChunkBitmap(
      'w1',
      RIGHT_EDGE_CX,
      0,
      tiles,
      REALISTIC_CHUNK_SIZE,
      REALISTIC_WORLD_WIDTH,
      clippedHeight
    );
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 1, 1);
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

function makeV2Data(
  overrides: Partial<{
    tileId: number;
    wallId: number;
    liquidType: number;
    liquidAmount: number;
  }>
): DecodedChunkV2 {
  return {
    tileId: new Int16Array([overrides.tileId ?? -1]),
    wallId: new Uint16Array([overrides.wallId ?? 0]),
    liquidType: new Uint8Array([overrides.liquidType ?? 0]),
    liquidAmount: new Uint8Array([overrides.liquidAmount ?? 0]),
    frameX: new Uint16Array([0]),
    frameY: new Uint16Array([0]),
    flags: new Uint8Array([0]),
  };
}

describe('renderChunkBitmapV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T-VL-1: draws wall color (fillRect) for tiles with wall_id > 0 and no tile', () => {
    const data = makeV2Data({ wallId: 1 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('T-VL-2: draws tile color (fillRect) for tiles with tile_id >= 0 and no wall', () => {
    const data = makeV2Data({ tileId: 1 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('T-VL-3: draws liquid color (fillRect) for tiles with liquid_type > 0 and amount > 0', () => {
    const data = makeV2Data({ liquidType: 1, liquidAmount: 200 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('T-VL-4: layer order — wall drawn before tile, tile before liquid', () => {
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    // Use once so subsequent tests fall back to the default mockCtx
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    const data = makeV2Data({ tileId: 1, wallId: 1, liquidType: 1, liquidAmount: 255 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);

    expect(callOrder).toHaveLength(3);
    expect(callOrder[0]).toBe(getWallColor(1));
    expect(callOrder[1]).toBe(getTileColor(1));
    expect(callOrder[2]).toBe(getLiquidColor(1));
  });

  it('T-VL-5: tile with wall+tile renders 2 fillRect calls total', () => {
    const data = makeV2Data({ tileId: 2, wallId: 3 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('T-VL-6: air tile with liquid_amount=0 renders 0 fillRect calls', () => {
    const data = makeV2Data({ liquidType: 1, liquidAmount: 0 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
