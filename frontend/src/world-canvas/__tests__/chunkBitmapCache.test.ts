import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChunkBitmapCache, renderChunkBitmapV2, hexToRgb } from '../chunkBitmapCache';
import type { RenderedChunk } from '../chunkBitmapCache';
import type { DecodedChunkV2 } from '../rleDecoder';
import {
  getTileColor,
  getWallColor,
  getLiquidColor,
  getWireColor,
  getBackgroundColor,
  WIRE_COLORS,
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

function makeV2Data(
  overrides: Partial<{
    tileId: number;
    wallId: number;
    liquidType: number;
    liquidAmount: number;
    flags: number;
  }>,
  total = 1
): DecodedChunkV2 {
  return {
    tileId: new Int16Array(total).fill(overrides.tileId ?? -1),
    wallId: new Uint16Array(total).fill(overrides.wallId ?? 0),
    liquidType: new Uint8Array(total).fill(overrides.liquidType ?? 0),
    liquidAmount: new Uint8Array(total).fill(overrides.liquidAmount ?? 0),
    frameX: new Uint16Array(total),
    frameY: new Uint16Array(total),
    flags: new Uint8Array(total).fill(overrides.flags ?? 0),
  };
}

describe('renderChunkBitmapV2 bitmap dimensions (unified renderer, IT-08)', () => {
  it('T-C1 should return HTMLCanvasElement sized chunkSize by chunkSize for full chunks', () => {
    const data = makeV2Data({}, 4 * 4);
    const result = renderChunkBitmapV2('w1', 0, 0, data, 4, 8, 8, SURFACE_Y, ROCK_Y, HELL_Y);
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.width).toBe(4);
    expect(result.canvas.height).toBe(4);
    expect(result.worldId).toBe('w1');
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
    expect(result.chunkSize).toBe(4);
  });

  it('T-C9 should size right-edge chunk bitmap to clipped world width', () => {
    const data = makeV2Data({}, RIGHT_EDGE_WIDTH * REALISTIC_CHUNK_SIZE);
    const result = renderChunkBitmapV2(
      'w1',
      RIGHT_EDGE_CX,
      0,
      data,
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
    const data = makeV2Data({}, REALISTIC_CHUNK_SIZE * BOTTOM_EDGE_HEIGHT);
    const result = renderChunkBitmapV2(
      'w1',
      0,
      BOTTOM_EDGE_CY,
      data,
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
    const data = makeV2Data({}, RIGHT_EDGE_WIDTH * BOTTOM_EDGE_HEIGHT);
    const result = renderChunkBitmapV2(
      'w1',
      RIGHT_EDGE_CX,
      BOTTOM_EDGE_CY,
      data,
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
    const data = makeV2Data({}, REALISTIC_CHUNK_SIZE * REALISTIC_CHUNK_SIZE);
    const result = renderChunkBitmapV2(
      'w1',
      31,
      8,
      data,
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
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    // 2-row partial chunk clipped to RIGHT_EDGE_WIDTH; the only solid tile is
    // at index RIGHT_EDGE_WIDTH → (tx=0, ty=1) when the stride is the clipped width.
    const clippedHeight = 2;
    const data = makeV2Data({}, RIGHT_EDGE_WIDTH * clippedHeight);
    data.tileId[RIGHT_EDGE_WIDTH] = 1;
    renderChunkBitmapV2(
      'w1',
      RIGHT_EDGE_CX,
      0,
      data,
      REALISTIC_CHUNK_SIZE,
      REALISTIC_WORLD_WIDTH,
      clippedHeight,
      SURFACE_Y,
      ROCK_Y,
      HELL_Y
    );
    const calls = localCtx.putImageData.mock.calls as ReadonlyArray<
      readonly [ImageData, ...unknown[]]
    >;
    const imageData = calls[0]?.[0];
    if (!imageData) throw new Error('putImageData was not called');
    const offset = RIGHT_EDGE_WIDTH * 4; // pixel (0, 1) with clipped stride
    const [tr, tg, tb] = hexToRgb(getTileColor(1));
    expect(imageData.data[offset]).toBe(tr);
    expect(imageData.data[offset + 1]).toBe(tg);
    expect(imageData.data[offset + 2]).toBe(tb);
  });
});

describe('createChunkBitmapCache', () => {
  const mkChunk = (worldId: string, cx: number, cy: number, chunkSize = 128): RenderedChunk => ({
    canvas: document.createElement('canvas'),
    worldId,
    cx,
    cy,
    chunkSize,
  });

  it('T-C5 should return undefined for missing key', () => {
    const cache = createChunkBitmapCache();
    expect(cache.get('w1', 128, 0, 0)).toBeUndefined();
  });

  it('T-C6 should retrieve a stored RenderedChunk by worldId, chunkSize, cx, cy', () => {
    const cache = createChunkBitmapCache();
    const chunk = mkChunk('w1', 3, 7);
    cache.set(chunk);
    expect(cache.get('w1', 128, 3, 7)).toBe(chunk);
    expect(cache.get('w1', 128, 3, 8)).toBeUndefined();
    expect(cache.get('w1', 256, 3, 7)).toBeUndefined();
    expect(cache.get('w2', 128, 3, 7)).toBeUndefined();
  });

  it('T-C7 clearWorld should remove only chunks for that worldId', () => {
    const cache = createChunkBitmapCache();
    cache.set(mkChunk('w1', 0, 0));
    cache.set(mkChunk('w1', 1, 0));
    cache.set(mkChunk('w2', 0, 0));
    cache.clearWorld('w1');
    expect(cache.get('w1', 128, 0, 0)).toBeUndefined();
    expect(cache.get('w1', 128, 1, 0)).toBeUndefined();
    expect(cache.get('w2', 128, 0, 0)).toBeDefined();
    expect(cache.size()).toBe(1);
  });

  it('T-C8 size should reflect cache count after set and clearWorld', () => {
    const cache = createChunkBitmapCache();
    expect(cache.size()).toBe(0);
    cache.set(mkChunk('w1', 0, 0));
    expect(cache.size()).toBe(1);
    cache.set(mkChunk('w1', 1, 0));
    expect(cache.size()).toBe(2);
    cache.clearWorld('w1');
    expect(cache.size()).toBe(0);
  });

  it('T-C14 should evict the least recently used chunk when the cap is exceeded (P07)', () => {
    const cache = createChunkBitmapCache(2);
    cache.set(mkChunk('w1', 0, 0));
    cache.set(mkChunk('w1', 1, 0));
    cache.set(mkChunk('w1', 2, 0));
    expect(cache.size()).toBe(2);
    expect(cache.get('w1', 128, 0, 0)).toBeUndefined();
    expect(cache.get('w1', 128, 1, 0)).toBeDefined();
    expect(cache.get('w1', 128, 2, 0)).toBeDefined();
  });

  it('T-C15 get should refresh recency so a recently drawn chunk survives eviction', () => {
    const cache = createChunkBitmapCache(2);
    cache.set(mkChunk('w1', 0, 0));
    cache.set(mkChunk('w1', 1, 0));
    cache.get('w1', 128, 0, 0); // refresh (0,0)
    cache.set(mkChunk('w1', 2, 0)); // evicts (1,0)
    expect(cache.get('w1', 128, 0, 0)).toBeDefined();
    expect(cache.get('w1', 128, 1, 0)).toBeUndefined();
    expect(cache.get('w1', 128, 2, 0)).toBeDefined();
  });
});

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

// ── IT-OPT-4 (cadena E14 3/4): wires pintados con los bits reales ─────────────

describe('getWireColor', () => {
  it('T-W1 maps each wire bit to its own color (v2 flags bits 2-5)', () => {
    expect(getWireColor(0b0000_0100)).toBe(WIRE_COLORS.red);
    expect(getWireColor(0b0000_1000)).toBe(WIRE_COLORS.blue);
    expect(getWireColor(0b0001_0000)).toBe(WIRE_COLORS.green);
    expect(getWireColor(0b0010_0000)).toBe(WIRE_COLORS.yellow);
  });

  it('T-W2 prefers red > blue > green > yellow when several wires coincide', () => {
    expect(getWireColor(0b0011_1100)).toBe(WIRE_COLORS.red);
    expect(getWireColor(0b0011_1000)).toBe(WIRE_COLORS.blue);
    expect(getWireColor(0b0011_0000)).toBe(WIRE_COLORS.green);
  });

  it('T-W3 returns null without wires — actuator alone (bit 1) does not paint', () => {
    expect(getWireColor(0)).toBeNull();
    expect(getWireColor(0b0000_0010)).toBeNull();
    expect(getWireColor(0b0000_0001)).toBeNull(); // has_frame
  });
});

describe('renderChunkBitmapV2 wires pass', () => {
  it('T-W4 paints the wire color on top when showWires is on', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 1, flags: 0b0000_1000 }); // blue wire
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y, {
      showWires: true,
    });
    const [r, g, b] = firstPixelRgba(localCtx);
    const [wr, wg, wb] = hexToRgb(WIRE_COLORS.blue);
    expect(r).toBe(wr);
    expect(g).toBe(wg);
    expect(b).toBe(wb);
  });

  it('T-W5 does not paint wires when showWires is off (default)', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 1, flags: 0b0000_0100 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y);
    const [r, g, b] = firstPixelRgba(localCtx);
    const [tr, tg, tb] = hexToRgb(getTileColor(1));
    expect(r).toBe(tr);
    expect(g).toBe(tg);
    expect(b).toBe(tb);
  });

  it('T-W6 actuator-only tiles stay unpainted even with showWires on', () => {
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const localCtx = makeLocalCtxV2();
    mockCtxGet.mockReturnValueOnce(localCtx as unknown as CanvasRenderingContext2D);
    const data = makeV2Data({ tileId: 1, flags: 0b0000_0010 });
    renderChunkBitmapV2('w1', 0, 0, data, 1, 1, 1, SURFACE_Y, ROCK_Y, HELL_Y, {
      showWires: true,
    });
    const [r, g, b] = firstPixelRgba(localCtx);
    const [tr, tg, tb] = hexToRgb(getTileColor(1));
    expect(r).toBe(tr);
    expect(g).toBe(tg);
    expect(b).toBe(tb);
  });
});
