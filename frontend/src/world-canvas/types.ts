// Provisional local types — structurally compatible with F1 (api-client).
// Replace with re-exports from F1 once that module ships.

export interface WorldMetadata {
  name: string;
  width: number;
  height: number;
  version: number;
  seed: string;
  size: 'small' | 'medium' | 'large';
  hardmode: boolean;
}

export interface TilesChunk {
  chunk_x: number;
  chunk_y: number;
  width: number;
  height: number;
  encoding: 'base64-rle-v1' | 'base64-rle-v2';
  payload: string;
}

// Narrowest structural slice of F1's ApiClient that world-canvas needs.
// F1's full ApiClient will be a structural supertype and therefore compatible.
export interface ApiClient {
  getTilesChunk(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkSize?: number
  ): Promise<TilesChunk>;
}
