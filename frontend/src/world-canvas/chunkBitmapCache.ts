import { getTileColor, getWallColor, getLiquidColor, getBackgroundColor } from './tileColors';
import { computeChunkDimensions } from './chunkDimensions';
import type { DecodedChunkV2 } from './rleDecoder';

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
  hellLayerY: number
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    // Row-by-row backdrop matching TerraMap's main.js banding
    // (sky → dirt → rock → hell). Painted inside world bounds only;
    // chunks outside the world are never requested, so the dark void
    // stays visible there.
    for (let ty = 0; ty < dimensions.h; ty++) {
      const worldY = cy * chunkSize + ty;
      ctx.fillStyle = getBackgroundColor(worldY, worldSurfaceY, rockLayerY, hellLayerY);
      ctx.fillRect(0, ty, dimensions.w, 1);
    }
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

// Renders a v2 decoded chunk to a bitmap canvas:
// pass 0 — backdrop band per row (sky/dirt/rock/hell),
// pass 1 — walls, pass 2 — tiles, pass 3 — liquids, pass 4 — wires.
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
  opts: { showWalls?: boolean; showLiquids?: boolean; showWires?: boolean } = {}
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    for (let ty = 0; ty < dimensions.h; ty++) {
      const worldY = cy * chunkSize + ty;
      ctx.fillStyle = getBackgroundColor(worldY, worldSurfaceY, rockLayerY, hellLayerY);
      ctx.fillRect(0, ty, dimensions.w, 1);
    }
    if (opts.showWalls ?? true) {
      for (let ty = 0; ty < dimensions.h; ty++) {
        for (let tx = 0; tx < dimensions.w; tx++) {
          const idx = ty * dimensions.w + tx;
          const wallId = data.wallId[idx] ?? 0;
          if (wallId > 0) {
            ctx.fillStyle = getWallColor(wallId);
            ctx.fillRect(tx, ty, 1, 1);
          }
        }
      }
    }
    for (let ty = 0; ty < dimensions.h; ty++) {
      for (let tx = 0; tx < dimensions.w; tx++) {
        const idx = ty * dimensions.w + tx;
        const tileId = data.tileId[idx] ?? -1;
        if (tileId >= 0) {
          ctx.fillStyle = getTileColor(tileId);
          ctx.fillRect(tx, ty, 1, 1);
        }
      }
    }
    if (opts.showLiquids ?? true) {
      for (let ty = 0; ty < dimensions.h; ty++) {
        for (let tx = 0; tx < dimensions.w; tx++) {
          const idx = ty * dimensions.w + tx;
          const liquidType = data.liquidType[idx] ?? 0;
          const liquidAmount = data.liquidAmount[idx] ?? 0;
          if (liquidType > 0 && liquidAmount > 0) {
            ctx.fillStyle = getLiquidColor(liquidType);
            ctx.fillRect(tx, ty, 1, 1);
          }
        }
      }
    }
    if (opts.showWires ?? false) {
      ctx.fillStyle = '#e53935';
      for (let ty = 0; ty < dimensions.h; ty++) {
        for (let tx = 0; tx < dimensions.w; tx++) {
          const idx = ty * dimensions.w + tx;
          if (((data.flags[idx] ?? 0) & 0b0011_1100) !== 0) {
            ctx.fillRect(tx, ty, 1, 1);
          }
        }
      }
    }
  }
  return { canvas, worldId, cx, cy };
}
