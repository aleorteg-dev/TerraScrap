export interface ChunkDimensions {
  w: number;
  h: number;
}

export function computeChunkDimensions(
  cx: number,
  cy: number,
  chunkSize: number,
  worldW: number,
  worldH: number
): ChunkDimensions {
  return {
    w: Math.max(0, Math.min(chunkSize, worldW - cx * chunkSize)),
    h: Math.max(0, Math.min(chunkSize, worldH - cy * chunkSize)),
  };
}
