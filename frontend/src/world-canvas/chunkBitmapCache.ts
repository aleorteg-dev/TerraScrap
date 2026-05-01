import { getTileColor } from './tileColors';
import { computeChunkDimensions } from './chunkDimensions';

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
