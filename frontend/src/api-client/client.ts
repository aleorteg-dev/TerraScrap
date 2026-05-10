import type { components } from './__generated__/schema';
import { ApiError, ApiVersionMismatchError, WorldNotFoundError, parseError } from './errors';

// ── Tipos re-exportados desde el schema generado ──────────────────────────────

export type WorldMetadata = components['schemas']['WorldMetadataDto'];
export type TilesChunk = components['schemas']['TilesChunkDto'];
export type SearchResult = components['schemas']['SearchResultDto'];
export type SearchMatch = components['schemas']['SearchMatchDto'];
export type ItemSummary = components['schemas']['ItemSummaryDto'];
export type ItemDetail = components['schemas']['ItemDetailDto'];
export type Npc = components['schemas']['NpcDto'];
export type NpcList = components['schemas']['NpcListDto'];
export type TileDetail = components['schemas']['TileDetailDto'];
export type TilesEncoding = TilesChunk['encoding'];

type WorldCreatedDto = components['schemas']['WorldCreatedDto'];
type ItemListDto = components['schemas']['ItemListDto'];

export const EXPECTED_API_VERSION = '0.2';

// ── Contrato público ──────────────────────────────────────────────────────────

export interface UploadOptions {
  onProgress?: (pct: number) => void;
}

export interface ApiClient {
  uploadWorld(
    file: File,
    opts?: UploadOptions
  ): Promise<{ worldId: string; metadata: WorldMetadata }>;
  getWorldMetadata(worldId: string): Promise<WorldMetadata>;
  getTilesChunk(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkSize?: number,
    encoding?: TilesEncoding
  ): Promise<TilesChunk>;
  getTileDetail(worldId: string, x: number, y: number): Promise<TileDetail>;
  listNpcs(worldId: string, opts?: { townOnly?: boolean }): Promise<Npc[]>;
  searchItems(query: string, limit?: number): Promise<ItemSummary[]>;
  getItem(itemId: number): Promise<ItemDetail>;
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
  xhrFactory?: () => XMLHttpRequest;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function checkApiVersion(response: Response): void {
  const v = response.headers.get('X-API-Version');
  if (v !== null && v !== EXPECTED_API_VERSION) {
    throw new ApiVersionMismatchError(
      'api_version_mismatch',
      response.status,
      `Expected X-API-Version ${EXPECTED_API_VERSION}, got ${v}`,
      { received: v, expected: EXPECTED_API_VERSION },
      v
    );
  }
}

async function doRequest<T>(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new ApiError('network_error', 0, msg);
  }

  checkApiVersion(response);

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const json: unknown = await response.json();
  return json as T;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createApiClient(opts?: ApiClientOptions): ApiClient {
  const baseUrl =
    opts?.baseUrl ?? (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api';
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const xhrFactory = opts?.xhrFactory ?? ((): XMLHttpRequest => new XMLHttpRequest());

  function uploadViaXhr(file: File, onProgress: (pct: number) => void): Promise<WorldCreatedDto> {
    return new Promise<WorldCreatedDto>((resolve, reject) => {
      const xhr = xhrFactory();
      const body = new FormData();
      body.append('file', file);
      xhr.open('POST', `${baseUrl}/worlds`);
      xhr.responseType = 'text';

      let lastPct = 0;
      xhr.upload.onprogress = (ev: ProgressEvent): void => {
        if (!ev.lengthComputable || ev.total <= 0) return;
        const pct = Math.max(0, Math.min(100, Math.floor((ev.loaded / ev.total) * 100)));
        if (pct >= lastPct) {
          lastPct = pct;
          onProgress(pct);
        }
      };
      xhr.upload.onerror = (): void => {
        reject(new ApiError('network_error', 0, 'Upload failed'));
      };
      xhr.onerror = (): void => {
        reject(new ApiError('network_error', 0, 'Network error'));
      };
      xhr.onload = (): void => {
        const apiVersion = xhr.getResponseHeader('X-API-Version') ?? undefined;
        if (apiVersion !== undefined && apiVersion !== EXPECTED_API_VERSION) {
          reject(
            new ApiVersionMismatchError(
              'api_version_mismatch',
              xhr.status,
              `Expected X-API-Version ${EXPECTED_API_VERSION}, got ${apiVersion}`,
              { received: apiVersion, expected: EXPECTED_API_VERSION },
              apiVersion
            )
          );
          return;
        }
        const status = xhr.status;
        const text = xhr.responseText;
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : undefined;
        } catch {
          parsed = undefined;
        }
        if (status >= 200 && status < 300) {
          if (lastPct < 100) {
            lastPct = 100;
            onProgress(100);
          }
          resolve(parsed as WorldCreatedDto);
        } else {
          const fakeResponse = {
            ok: false,
            status,
            json: (): Promise<unknown> => Promise.resolve(parsed),
            headers: {
              get: (name: string): string | null =>
                name.toLowerCase() === 'x-api-version' ? (apiVersion ?? null) : null,
            },
          } as unknown as Response;
          parseError(fakeResponse).then(reject, reject);
        }
      };
      xhr.send(body);
    });
  }

  return {
    async uploadWorld(file: File, uploadOpts?: UploadOptions) {
      if (uploadOpts?.onProgress) {
        const dto = await uploadViaXhr(file, uploadOpts.onProgress);
        return { worldId: dto.world_id, metadata: dto.metadata };
      }
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

    getTilesChunk(
      worldId: string,
      chunkX: number,
      chunkY: number,
      chunkSize?: number,
      encoding?: TilesEncoding
    ) {
      const params = new URLSearchParams({
        chunk_x: String(chunkX),
        chunk_y: String(chunkY),
      });
      if (chunkSize !== undefined) params.set('chunk_size', String(chunkSize));
      if (encoding !== undefined) params.set('encoding', encoding);
      return doRequest<TilesChunk>(
        fetchImpl,
        `${baseUrl}/worlds/${worldId}/tiles?${params.toString()}`
      );
    },

    getTileDetail(worldId: string, x: number, y: number) {
      const params = new URLSearchParams({ x: String(x), y: String(y) });
      return doRequest<TileDetail>(
        fetchImpl,
        `${baseUrl}/worlds/${worldId}/tile?${params.toString()}`
      );
    },

    async listNpcs(worldId: string, listOpts?: { townOnly?: boolean }) {
      const params = new URLSearchParams();
      if (listOpts?.townOnly !== undefined) {
        params.set('town_only', String(listOpts.townOnly));
      }
      const qs = params.toString();
      const url = qs
        ? `${baseUrl}/worlds/${worldId}/npcs?${qs}`
        : `${baseUrl}/worlds/${worldId}/npcs`;
      const dto = await doRequest<NpcList>(fetchImpl, url);
      return dto.npcs;
    },

    async searchItems(query: string, limit?: number) {
      const params = new URLSearchParams({ q: query });
      if (limit !== undefined) params.set('limit', String(limit));
      const dto = await doRequest<ItemListDto>(fetchImpl, `${baseUrl}/items?${params.toString()}`);
      return dto.items;
    },

    getItem(itemId: number) {
      return doRequest<ItemDetail>(fetchImpl, `${baseUrl}/items/${itemId}`);
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
      checkApiVersion(response);
      if (response.status === 404) {
        throw await parseError(response).then((e) =>
          e instanceof WorldNotFoundError
            ? e
            : new WorldNotFoundError('world_not_found', 404, e.message, e.details, e.apiVersion)
        );
      }
      if (response.status === 204 || response.ok) return;
      throw await parseError(response);
    },
  };
}
