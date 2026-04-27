import type { components } from './__generated__/schema';

// ── Tipos re-exportados desde el schema generado ──────────────────────────────

export type WorldMetadata = components['schemas']['WorldMetadataDto'];
export type TilesChunk = components['schemas']['TilesChunkDto'];
export type SearchResult = components['schemas']['SearchResultDto'];
export type SearchMatch = components['schemas']['SearchMatchDto'];
export type ItemSummary = components['schemas']['ItemSummaryDto'];
export type ItemDetail = components['schemas']['ItemDetailDto'];

// Tipo interno: no expuesto, sólo usado dentro de uploadWorld
type WorldCreatedDto = components['schemas']['WorldCreatedDto'];
type ItemListDto = components['schemas']['ItemListDto'];

// ── ApiError ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(code: string, httpStatus: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ── Contrato público ──────────────────────────────────────────────────────────

export interface ApiClient {
  uploadWorld(file: File): Promise<{ worldId: string; metadata: WorldMetadata }>;
  getWorldMetadata(worldId: string): Promise<WorldMetadata>;
  getTilesChunk(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkSize?: number
  ): Promise<TilesChunk>;
  searchItems(query: string, limit?: number): Promise<ItemSummary[]>;
  searchInWorld(
    worldId: string,
    itemId: number,
    includeContainers?: boolean
  ): Promise<SearchResult>;
  deleteWorld(worldId: string): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function isErrorPayload(
  v: unknown
): v is { error: { code: string; message: string; details?: unknown } } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const inner = (v as Record<string, unknown>)['error'];
  if (typeof inner !== 'object' || inner === null) return false;
  const err = inner as Record<string, unknown>;
  return typeof err['code'] === 'string' && typeof err['message'] === 'string';
}

async function doRequest<T>(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new ApiError('network_error', 0, msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const body: unknown = await response.json();
    if (isErrorPayload(body)) {
      throw new ApiError(body.error.code, response.status, body.error.message, body.error.details);
    }
    throw new ApiError('unknown_error', response.status, 'Unknown server error');
  }

  const json: unknown = await response.json();
  return json as T;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createApiClient(opts?: ApiClientOptions): ApiClient {
  const baseUrl =
    opts?.baseUrl ?? (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api';
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async uploadWorld(file: File) {
      const body = new FormData();
      body.append('file', file);
      const dto = await doRequest<WorldCreatedDto>(fetchImpl, `${baseUrl}/worlds`, {
        method: 'POST',
        body,
      });
      return { worldId: dto.world_id, metadata: dto.metadata };
    },

    getWorldMetadata(worldId: string) {
      return doRequest<WorldMetadata>(fetchImpl, `${baseUrl}/worlds/${worldId}`);
    },

    getTilesChunk(worldId: string, chunkX: number, chunkY: number, chunkSize?: number) {
      const params = new URLSearchParams({
        chunk_x: String(chunkX),
        chunk_y: String(chunkY),
      });
      if (chunkSize !== undefined) params.set('chunk_size', String(chunkSize));
      return doRequest<TilesChunk>(
        fetchImpl,
        `${baseUrl}/worlds/${worldId}/tiles?${params.toString()}`
      );
    },

    async searchItems(query: string, limit?: number) {
      const params = new URLSearchParams({ q: query });
      if (limit !== undefined) params.set('limit', String(limit));
      const dto = await doRequest<ItemListDto>(fetchImpl, `${baseUrl}/items?${params.toString()}`);
      return dto.items;
    },

    searchInWorld(worldId: string, itemId: number, includeContainers?: boolean) {
      const params = new URLSearchParams({ item_id: String(itemId) });
      if (includeContainers !== undefined) {
        params.set('include_containers', String(includeContainers));
      }
      return doRequest<SearchResult>(
        fetchImpl,
        `${baseUrl}/worlds/${worldId}/search?${params.toString()}`
      );
    },

    async deleteWorld(worldId: string) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/worlds/${worldId}`, { method: 'DELETE' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        throw new ApiError('network_error', 0, msg);
      }
      // SP-06: swallow 404 (idempotente)
      if (response.status === 404) return;
      if (response.ok) return;
      const body: unknown = await response.json();
      if (isErrorPayload(body)) {
        throw new ApiError(
          body.error.code,
          response.status,
          body.error.message,
          body.error.details
        );
      }
      throw new ApiError('unknown_error', response.status, 'Unknown server error');
    },
  };
}
