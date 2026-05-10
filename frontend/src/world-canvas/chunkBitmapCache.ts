import { getTileColor, getWallColor, getLiquidColor } from './tileColors';
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
  worldH: number
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
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

// Renders a v2 decoded chunk to a bitmap canvas using three passes:
// pass 1 — walls, pass 2 — tiles, pass 3 — liquids.
export function renderChunkBitmapV2(
  worldId: string,
  cx: number,
  cy: number,
  data: DecodedChunkV2,
  chunkSize: number,
  worldW: number,
  worldH: number
): RenderedChunk {
  const dimensions = computeChunkDimensions(cx, cy, chunkSize, worldW, worldH);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    // Pass 1: walls
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
    // Pass 2: tiles
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
    // Pass 3: liquids
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
  return { canvas, worldId, cx, cy };
}
