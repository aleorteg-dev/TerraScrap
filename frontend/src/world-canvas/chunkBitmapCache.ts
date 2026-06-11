import {
  getTileColor,
  getWallColor,
  getLiquidColor,
  getBackgroundColor,
  resolveBackgroundBreakpoints,
} from './tileColors';
import { computeChunkDimensions } from './chunkDimensions';
import type { DecodedChunkV2 } from './rleDecoder';

// ── Color cache (hex string → [r, g, b]) ────────────────────────────────────

const _rgbCache = new Map<string, readonly [number, number, number]>();

export function hexToRgb(hex: string): readonly [number, number, number] {
  let cached = _rgbCache.get(hex);
  if (cached === undefined) {
    cached = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ] as const;
    _rgbCache.set(hex, cached);
  }
  return cached;
}

function writePixel(buf: Uint8ClampedArray, offset: number, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  buf[offset] = r;
  buf[offset + 1] = g;
  buf[offset + 2] = b;
  buf[offset + 3] = 255;
}

export interface RenderedChunk {
  canvas: HTMLCanvasElement;
  worldId: string;
  cx: number;
  cy: number;
}

export interface ChunkBitmapCache {
  get(worldId: string, cx: number, cy: number): RenderedChunk | undefined;
  set(chunk: RenderedChunk): void;
  clearWorld(worldId: string): void;
  size(): number;
}

export function createChunkBitmapCache(): ChunkBitmapCache {
  const store = new Map<string, RenderedChunk>();
  return {
    get(worldId: string, cx: number, cy: number): RenderedChunk | undefined {
      return store.get(`${worldId}:${cx}:${cy}`);
    },
    set(chunk: RenderedChunk): void {
      store.set(`${chunk.worldId}:${chunk.cx}:${chunk.cy}`, chunk);
    },
    clearWorld(worldId: string): void {
      const prefix = `${worldId}:`;
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },
    size(): number {
      return store.size;
    },
  };
}

export function renderChunkBitmap(
  worldId: string,
  cx: number,
  cy: number,
  tiles: Int16Array,
  chunkSize: number,
  worldW: number,
  worldH: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number,
  surfaceYByColumn?: readonly number[]
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    // Backdrop matching TerraMap's banding, with per-column open sky when the
    // backend provides terrain height for irregular surface chunks.
    paintBackdrop(
      ctx,
      cy,
      chunkSize,
      dimensions.w,
      dimensions.h,
      worldH,
      worldSurfaceY,
      rockLayerY,
      hellLayerY,
      surfaceYByColumn
    );
    for (let ty = 0; ty < dimensions.h; ty++) {
      for (let tx = 0; tx < dimensions.w; tx++) {
        const tileId = tiles[ty * dimensions.w + tx] ?? -1;
        if (tileId < 0) continue;
        ctx.fillStyle = getTileColor(tileId);
        ctx.fillRect(tx, ty, 1, 1);
      }
    }
  }
  return { canvas, worldId, cx, cy };
}

// Renders a v2 decoded chunk to a bitmap canvas using a single ImageData pass.
// Layer order per pixel: backdrop → wall → tile → liquid → wire.
export function renderChunkBitmapV2(
  worldId: string,
  cx: number,
  cy: number,
  data: DecodedChunkV2,
  chunkSize: number,
  worldW: number,
  worldH: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number,
  opts: { showWalls?: boolean; showLiquids?: boolean; showWires?: boolean } = {},
  surfaceYByColumn?: readonly number[]
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    const imageData = ctx.createImageData(dimensions.w, dimensions.h);
    const buf = imageData.data;
    const bp = resolveBackgroundBreakpoints(worldH, worldSurfaceY, rockLayerY, hellLayerY);
    const hasColumnSurface = surfaceYByColumn !== undefined && surfaceYByColumn.length > 0;
    const showWalls = opts.showWalls ?? true;
    const showLiquids = opts.showLiquids ?? true;
    const showWires = opts.showWires ?? false;

    for (let ty = 0; ty < dimensions.h; ty++) {
      const worldY = cy * chunkSize + ty;
      for (let tx = 0; tx < dimensions.w; tx++) {
        const idx = ty * dimensions.w + tx;
        const bufOffset = idx * 4;

        // Pass 0: backdrop
        let bgColor: string;
        if (!hasColumnSurface || worldY >= bp.rock) {
          bgColor = getBackgroundColor(worldY, worldSurfaceY, rockLayerY, hellLayerY, worldH);
        } else {
          bgColor = getBackgroundColor(
            worldY,
            worldSurfaceY,
            rockLayerY,
            hellLayerY,
            worldH,
            (surfaceYByColumn as readonly number[])[tx] ?? Number.NaN
          );
        }
        writePixel(buf, bufOffset, bgColor);

        // Pass 1: wall
        if (showWalls) {
          const wallId = data.wallId[idx] ?? 0;
          if (wallId > 0) writePixel(buf, bufOffset, getWallColor(wallId));
        }

        // Pass 2: tile
        const tileId = data.tileId[idx] ?? -1;
        if (tileId >= 0) writePixel(buf, bufOffset, getTileColor(tileId));

        // Pass 3: liquid
        if (showLiquids) {
          const liquidType = data.liquidType[idx] ?? 0;
          const liquidAmount = data.liquidAmount[idx] ?? 0;
          if (liquidType > 0 && liquidAmount > 0)
            writePixel(buf, bufOffset, getLiquidColor(liquidType));
        }

        // Pass 4: wire
        if (showWires && ((data.flags[idx] ?? 0) & 0b0011_1100) !== 0) {
          writePixel(buf, bufOffset, '#e53935');
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
  return { canvas, worldId, cx, cy };
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  cy: number,
  chunkSize: number,
  width: number,
  height: number,
  worldH: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number,
  surfaceYByColumn?: readonly number[]
): void {
  const bp = resolveBackgroundBreakpoints(worldH, worldSurfaceY, rockLayerY, hellLayerY);
  const hasColumnSurface = surfaceYByColumn !== undefined && surfaceYByColumn.length > 0;
  for (let ty = 0; ty < height; ty++) {
    const worldY = cy * chunkSize + ty;
    // Per-column surface_y only refines the sky↔dirt boundary. At or below
    // bp.rock every column shares the same band (rock or hell), so a single
    // row fill is correct — and guarantees caves/hell are never repainted as
    // sky by a bogus per-column value.
    if (!hasColumnSurface || worldY >= bp.rock) {
      ctx.fillStyle = getBackgroundColor(worldY, worldSurfaceY, rockLayerY, hellLayerY, worldH);
      ctx.fillRect(0, ty, width, 1);
      continue;
    }
    for (let tx = 0; tx < width; tx++) {
      ctx.fillStyle = getBackgroundColor(
        worldY,
        worldSurfaceY,
        rockLayerY,
        hellLayerY,
        worldH,
        surfaceYByColumn[tx] ?? Number.NaN
      );
      ctx.fillRect(tx, ty, 1, 1);
    }
  }
}
