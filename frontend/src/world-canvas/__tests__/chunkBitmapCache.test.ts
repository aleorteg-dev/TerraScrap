import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createChunkBitmapCache,
  renderChunkBitmap,
  renderChunkBitmapV2,
  hexToRgb,
} from '../chunkBitmapCache';
import type { DecodedChunkV2 } from '../rleDecoder';
import {
  getTileColor,
  getWallColor,
  getLiquidColor,
  getBackgroundColor,
  SKY_TOP_COLOR,
  SKY_BAND_COLOR,
  DIRT_BAND_COLOR,
  ROCK_BAND_COLOR,
  HELL_BAND_COLOR,
} from '../tileColors';

// Helper: make a local mock context with createImageData/putImageData support.
function makeLocalCtxV2(): {
  createImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillStyle?: string;
} & Partial<CanvasRenderingContext2D> {
  return {
    createImageData: vi
      .fn()
      .mockImplementation(
        (w: number, h: number): ImageData =>
          ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData
      ),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
  };
}

// Read pixel RGBA at index 0 from imageData captured by putImageData.
function firstPixelRgba(
  ctx: ReturnType<typeof makeLocalCtxV2>
): readonly [number, number, number, number] {
  const calls = ctx.putImageData.mock.calls as ReadonlyArray<readonly [ImageData, ...unknown[]]>;
  const imageData = calls[0]?.[0];
  if (!imageData) throw new Error('putImageData was not called');
  const d = imageData.data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0] as const;
}

const REALISTIC_WORLD_WIDTH = 8400;
const REALISTIC_WORLD_HEIGHT = 2400;
const REALISTIC_CHUNK_SIZE = 256;
const RIGHT_EDGE_CX = Math.ceil(REALISTIC_WORLD_WIDTH / REALISTIC_CHUNK_SIZE) - 1;
const BOTTOM_EDGE_CY = Math.ceil(REALISTIC_WORLD_HEIGHT / REALISTIC_CHUNK_SIZE) - 1;
const RIGHT_EDGE_WIDTH = REALISTIC_WORLD_WIDTH - RIGHT_EDGE_CX * REALISTIC_CHUNK_SIZE;
const BOTTOM_EDGE_HEIGHT = REALISTIC_WORLD_HEIGHT - BOTTOM_EDGE_CY * REALISTIC_CHUNK_SIZE;

// Layer breakpoints used across most tests. All rows in our small fixtures
// at cy=0 sit in the sky band (y < SURFACE_Y) unless a test overrides them.
const SURFACE_Y = 240;
const ROCK_Y = 600;
const HELL_Y = 1100;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderChunkBitmap', () => {
  it('T-C1 should return HTMLCanvasElement sized chunkSize by chunkSize for full chunks', () => {
    const tiles = new Int16Array(4 * 4).fill(-1);
    const result = renderChunkBitmap('w1', 0, 0, tiles, 4, 8, 8, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.width).toBe(4);
    expect(result.canvas.height).toBe(4);
    expect(result.worldId).toBe('w1');
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
  });

  it('T-C2 should call fillRect for the per-row backdrop and each non-air tile', () => {
    // 2 by 2 chunk: tiles at (0,0) and (0,1) are non-air; the others are air.
    const tiles = new Int16Array(4);
    tiles[0] = 1; // tx=0, ty=0, Stone
    tiles[1] = -1; // tx=1, ty=0, air
    tiles[2] = 2; // tx=0, ty=1, Grass
    tiles[3] = -1; // tx=1, ty=1, air
    renderChunkBitmap('w1', 0, 0, tiles, 2, 4, 4, SURFACE_Y, ROCK_Y, HELL_Y);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    // 2 backdrop rows + 2 non-air tiles.
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
  });

  it('T-C3 should still paint a backdrop row for every line even when all tiles are air', () => {
    const tiles = new Int16Array(2 * 2).fill(-1);
    renderChunkBitmap('w1', 0, 0, tiles, 2, 4, 4, SURFACE_Y, ROCK_Y, HELL_Y);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    // 2 backdrop rows, no tile fills.
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 2, 1);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 1, 2, 1);
  });

  it('T-C4 should use correct pixel coordinates (tx, ty, 1, 1) for each tile', () => {
    const tiles = new Int16Array(2 * 2).fill(1);
    renderChunkBitmap('w1', 3, 7, tiles, 2, 8, 16, SURFACE_Y, ROCK_Y, HELL_Y);
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
      REALISTIC_WORLD_HEIGHT,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
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
      REALISTIC_WORLD_HEIGHT,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
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
      REALISTIC_WORLD_HEIGHT,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
    );
    expect(result.canvas.width).toBe(RIGHT_EDGE_WIDTH);
    expect(result.canvas.height).toBe(BOTTOM_EDGE_HEIGHT);
  });

  it('T-C12 should keep full chunk dimensions when world dimensions are multiples of chunkSize', () => {
    const tiles = new Int16Array(REALISTIC_CHUNK_SIZE * REALISTIC_CHUNK_SIZE).fill(-1);
    const result = renderChunkBitmap(
      'w1',
      31,
      8,
      tiles,
      REALISTIC_CHUNK_SIZE,
      8192,
      2304,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
    );
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
      clippedHeight,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
    );
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const ctx = mockCtxGet.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    // 2 backdrop rows + 1 non-air tile.
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 1, 1);
  });

  it('T-Bg-Sky paints the sky gradient for rows above the world surface', () => {
    const tiles = new Int16Array(2).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    renderChunkBitmap('w1', 0, 0, tiles, 2, 1, 2, 2, 20, 30);

    expect(callOrder).toEqual([SKY_TOP_COLOR, SKY_BAND_COLOR]);
  });

  it('T-Bg-Dirt paints the dirt band color between surface and rock layers', () => {
    const tiles = new Int16Array(1).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    // cy=5, chunkSize=1 → worldY=5. surface=5 → 5 >= surface → dirt band.
    renderChunkBitmap('w1', 0, 5, tiles, 1, 1, 6, 5, 10, 20);

    expect(callOrder).toEqual([DIRT_BAND_COLOR]);
  });

  it('T-Bg-ColumnSky paints open air above the first solid tile in its column as sky', () => {
    const tiles = new Int16Array(1).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    renderChunkBitmap('w1', 0, 320, tiles, 1, 1, 1200, 240, 600, 1100, [420]);

    expect(callOrder).toEqual([getBackgroundColor(320, 240, 600, 1100, 1200, 420)]);
    expect(callOrder[0]).not.toBe(DIRT_BAND_COLOR);
  });

  it('T-Bg-ColumnSkyStable two columns with different surface_y same worldY share sky color', () => {
    const tiles = new Int16Array(4).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    // worldH=1200, surface=240, rock=600, hell=1100. chunkSize=2, cy=160 →
    // first row worldY=320; chunk width=2 with two columns whose surface_y
    // differ (canyon 420 vs deeper 580). Both classify as sky at worldY=320
    // and must produce the SAME color (no vertical seam).
    renderChunkBitmap('w1', 0, 160, tiles, 2, 2, 1200, 240, 600, 1100, [420, 580]);

    // 2 rows × 2 columns = 4 backdrop fills (per-column loop fires because
    // hasColumnSurface && worldY < bp.rock).
    expect(callOrder).toHaveLength(4);
    expect(callOrder[0]).toBe(callOrder[1]);
    expect(callOrder[2]).toBe(callOrder[3]);
    expect(callOrder[0]).not.toBe(DIRT_BAND_COLOR);
  });

  it('T-Bg-Air ignores implausibly tiny surface metadata so sky air is not brown', () => {
    const tiles = new Int16Array(1).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    renderChunkBitmap('w1', 0, 10, tiles, 1, 1, 1200, Number.MIN_VALUE, 0, 0);

    expect(callOrder).toEqual([getBackgroundColor(10, Number.MIN_VALUE, 0, 0, 1200)]);
    expect(callOrder[0]).not.toBe(DIRT_BAND_COLOR);
  });

  it('T-Bg-Rock paints the rock band color between rock and hell layers', () => {
    const tiles = new Int16Array(1).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    // worldY=10, rockY=10 → rock band.
    renderChunkBitmap('w1', 0, 10, tiles, 1, 1, 11, 5, 10, 20);

    expect(callOrder).toEqual([ROCK_BAND_COLOR]);
  });

  it('T-Bg-Hell paints black for rows at or below the hell layer', () => {
    const tiles = new Int16Array(1).fill(-1);
    const callOrder: string[] = [];
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn().mockImplementation(() => {
        callOrder.push(String(localCtx.fillStyle));
      }),
      clearRect: vi.fn(),
    };
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);

    // worldY=20, hellY=20 → hell band.
    renderChunkBitmap('w1', 0, 20, tiles, 1, 1, 21, 5, 10, 20);

    expect(callOrder).toEqual([HELL_BAND_COLOR]);
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

  it('T-VL-1: wall color overwrites backdrop in ImageData (putImageData called once)', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ wallId: 1 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    const [r, g, b, a] = firstPixelRgba(localCtx);
    const [wr, wg, wb] = hexToRgb(getWallColor(1));
    expect(r).toBe(wr);
    expect(g).toBe(wg);
    expect(b).toBe(wb);
    expect(a).toBe(255);
  });

  it('T-VL-2: tile color overwrites backdrop in ImageData', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 1 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [tr, tg, tb] = hexToRgb(getTileColor(1));
    expect(r).toBe(tr);
    expect(g).toBe(tg);
    expect(b).toBe(tb);
  });

  it('T-VL-3: liquid color overwrites backdrop in ImageData', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ liquidType: 1, liquidAmount: 200 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [lr, lg, lb] = hexToRgb(getLiquidColor(1));
    expect(r).toBe(lr);
    expect(g).toBe(lg);
    expect(b).toBe(lb);
  });

  it('T-VL-4: layer order — liquid wins over tile wins over wall wins over backdrop', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 1, wallId: 1, liquidType: 1, liquidAmount: 255 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    // Final pixel must be liquid color (topmost layer)
    const [r, g, b] = firstPixelRgba(localCtx);
    const [lr, lg, lb] = hexToRgb(getLiquidColor(1));
    expect(r).toBe(lr);
    expect(g).toBe(lg);
    expect(b).toBe(lb);
  });

  it('T-VL-5: wall+tile — pixel gets tile color (tile wins over wall)', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 2, wallId: 3 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [tr, tg, tb] = hexToRgb(getTileColor(2));
    expect(r).toBe(tr);
    expect(g).toBe(tg);
    expect(b).toBe(tb);
  });

  it('T-VL-6: air cell gets backdrop color — putImageData called once', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ liquidType: 1, liquidAmount: 0 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(localCtx.putImageData).toHaveBeenCalledTimes(1);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [br, bg2, bb] = hexToRgb(getBackgroundColor(0, SURFACE_Y, ROCK_Y, HELL_Y));
    expect(r).toBe(br);
    expect(g).toBe(bg2);
    expect(b).toBe(bb);
  });

  it('T-Bg-V2-Underground: cells below surface get dirt/rock/hell band color', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    // cy=5, chunkSize=1 → worldY=5. surface=5 → dirt band.
    renderChunkBitmapV2('w1', 0, 5, makeV2Data({}), 1, 1, 6, 5, 10, 20);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [dr, dg, db] = hexToRgb(DIRT_BAND_COLOR);
    expect(r).toBe(dr);
    expect(g).toBe(dg);
    expect(b).toBe(db);
  });

  it('T-Bg-V2-ColumnSky: open air above the column surface stays sky', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    renderChunkBitmapV2('w1', 0, 320, makeV2Data({}), 1, 1, 1200, 240, 600, 1100, {}, [420]);
    const [r, g, b] = firstPixelRgba(localCtx);
    const expectedColor = getBackgroundColor(320, 240, 600, 1100, 1200, 420);
    const [er, eg, eb] = hexToRgb(expectedColor);
    expect(r).toBe(er);
    expect(g).toBe(eg);
    expect(b).toBe(eb);
    const [dr] = hexToRgb(DIRT_BAND_COLOR);
    expect(r).not.toBe(dr);
  });

  it('T-Bg-V2-ColumnGround: air below column surface uses underground background', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    renderChunkBitmapV2('w1', 0, 320, makeV2Data({}), 1, 1, 1200, 240, 600, 1100, {}, [300]);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [dr, dg, db] = hexToRgb(DIRT_BAND_COLOR);
    expect(r).toBe(dr);
    expect(g).toBe(dg);
    expect(b).toBe(db);
  });

  it('T-Bg-V2-Bands: renders sky/dirt/rock/hell colors at each band depth', () => {
    const worldH = 1200;
    const surface = 245;
    const rock = 411;
    const hell = 965;
    const cases: ReadonlyArray<{ cy: number; expected: string }> = [
      { cy: 100, expected: getBackgroundColor(100, surface, rock, hell, worldH) },
      { cy: 300, expected: DIRT_BAND_COLOR },
      { cy: 500, expected: ROCK_BAND_COLOR },
      { cy: 1000, expected: HELL_BAND_COLOR },
    ];
    for (const { cy, expected } of cases) {
      vi.clearAllMocks();
      const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
      const localCtx = makeLocalCtxV2();
      mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
      renderChunkBitmapV2('w1', 0, cy, makeV2Data({}), 1, 1, worldH, surface, rock, hell);
      const [r, g, b] = firstPixelRgba(localCtx);
      const [er, eg, eb] = hexToRgb(expected);
      expect(r).toBe(er);
      expect(g).toBe(eg);
      expect(b).toBe(eb);
    }
  });

  it('T-Bg-V2-ColumnClamped: surface_y deep in rock never paints rock as sky', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    renderChunkBitmapV2('w1', 0, 600, makeV2Data({}), 1, 1, 1200, 245, 411, 965, {}, [1199]);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [rr, rg, rb] = hexToRgb(ROCK_BAND_COLOR);
    expect(r).toBe(rr);
    expect(g).toBe(rg);
    expect(b).toBe(rb);
  });

  it('T-Bg-V2-ColumnClampedHell: per-column surface_y at world bottom keeps hell color', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    renderChunkBitmapV2('w1', 0, 1000, makeV2Data({}), 1, 1, 1200, 245, 411, 965, {}, [1199]);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [hr, hg, hb] = hexToRgb(HELL_BAND_COLOR);
    expect(r).toBe(hr);
    expect(g).toBe(hg);
    expect(b).toBe(hb);
  });
});
