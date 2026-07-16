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
type ImportJobCreatedDto = components['schemas']['ImportJobCreatedDto'];
type ImportJobStatusDto = components['schemas']['ImportJobStatusDto'];

export const EXPECTED_API_VERSION = '0.2';

/** Timeout global por defecto de la fase de polling de un import job (IT-02). */
export const DEFAULT_IMPORT_TIMEOUT_MS = 300_000;

const MAX_CONSECUTIVE_POLL_NETWORK_ERRORS = 3;

// ── Contrato público ──────────────────────────────────────────────────────────

export interface UploadOptions {
  onProgress?: (pct: number) => void;
  /** Timeout global del polling del import job; default DEFAULT_IMPORT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface SearchInWorldOptions {
  includeContainers?: boolean;
  frameX?: number;
  frameY?: number;
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
  searchItems(
    query: string,
    limit?: number,
    opts?: { signal?: AbortSignal }
  ): Promise<ItemSummary[]>;
  getItem(itemId: number): Promise<ItemDetail>;
  searchInWorld(
    worldId: string,
    itemId: number,
    options?: SearchInWorldOptions | boolean
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

  function uploadViaXhrForJob(
    file: File,
    onUploadProgress: (pct: number) => void
  ): Promise<ImportJobCreatedDto> {
    return new Promise<ImportJobCreatedDto>((resolve, reject) => {
      const xhr = xhrFactory();
      const body = new FormData();
      body.append('file', file);
      xhr.open('POST', `${baseUrl}/world-imports`);
      xhr.responseType = 'text';

      let lastPct = 0;
      xhr.upload.onprogress = (ev: ProgressEvent): void => {
        if (!ev.lengthComputable || ev.total <= 0) return;
        // Scale upload bytes to 0-49% — 50-100% reserved for server-side processing
        const rawPct = Math.floor((ev.loaded / ev.total) * 49);
        const pct = Math.max(0, Math.min(49, rawPct));
        if (pct > lastPct) {
          lastPct = pct;
          onUploadProgress(pct);
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
          resolve(parsed as ImportJobCreatedDto);
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

  async function pollImportJob(
    jobId: string,
    onJobProgress: (pct: number) => void,
    intervalMs = 500,
    timeoutMs = DEFAULT_IMPORT_TIMEOUT_MS
  ): Promise<{ worldId: string; metadata: WorldMetadata }> {
    const deadline = Date.now() + timeoutMs;
    let consecutiveNetworkErrors = 0;
    let lastReported = 49;
    for (;;) {
      let dto: ImportJobStatusDto | undefined;
      try {
        dto = await doRequest<ImportJobStatusDto>(fetchImpl, `${baseUrl}/world-imports/${jobId}`);
        consecutiveNetworkErrors = 0;
      } catch (err) {
        if (err instanceof ApiVersionMismatchError || !(err instanceof ApiError)) {
          throw err;
        }
        if (err.code !== 'network_error') {
          // Respuesta HTTP de error del poll (p. ej. 404 job_not_found tras la
          // retención de 15 min del servidor): irrecuperable, error inmediato.
          throw new ApiError('import_error', err.status, err.message, { cause: err.code });
        }
        consecutiveNetworkErrors += 1;
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_POLL_NETWORK_ERRORS) {
          throw new ApiError('import_error', 0, 'Import polling failed: network unavailable.', {
            cause: 'network_error',
          });
        }
      }
      if (dto !== undefined) {
        if (dto.status === 'error') {
          throw new ApiError(
            dto.error_code ?? 'import_error',
            0,
            dto.error_message ?? 'Import failed'
          );
        }
        // Map job pct (0-100) to 50-99%
        const scaled = 50 + Math.min(49, Math.floor((dto.pct * 49) / 100));
        if (scaled > lastReported) {
          lastReported = scaled;
          onJobProgress(scaled);
        }
        if (dto.status === 'done' && dto.world_id != null && dto.metadata != null) {
          return { worldId: dto.world_id, metadata: dto.metadata as WorldMetadata };
        }
      }
      if (Date.now() >= deadline) {
        throw new ApiError('import_timeout', 0, `Import did not finish within ${timeoutMs} ms.`, {
          timeoutMs,
        });
      }
      await new Promise<void>((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    async uploadWorld(file: File, uploadOpts?: UploadOptions) {
      if (uploadOpts?.onProgress) {
        const onProgress = uploadOpts.onProgress;
        // Phase 1: upload (0-49%)
        const jobDto = await uploadViaXhrForJob(file, onProgress);
        // Phase 2: server processing (50-99%)
        const result = await pollImportJob(
          jobDto.job_id,
          onProgress,
          undefined,
          uploadOpts.timeoutMs
        );
        // 100% only when world_id received
        onProgress(100);
        return result;
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

    async searchItems(query: string, limit?: number, opts?: { signal?: AbortSignal }) {
      const params = new URLSearchParams({ q: query });
      if (limit !== undefined) params.set('limit', String(limit));
      const dto = await doRequest<ItemListDto>(
        fetchImpl,
        `${baseUrl}/items?${params.toString()}`,
        opts?.signal ? { signal: opts.signal } : undefined
      );
      return dto.items;
    },

    getItem(itemId: number) {
      return doRequest<ItemDetail>(fetchImpl, `${baseUrl}/items/${itemId}`);
    },

    searchInWorld(worldId: string, itemId: number, options?: SearchInWorldOptions | boolean) {
      const params = new URLSearchParams({ item_id: String(itemId) });
      const normalized =
        typeof options === 'boolean' ? { includeContainers: options } : (options ?? {});
      const { includeContainers, frameX, frameY } = normalized;
      if (includeContainers !== undefined) {
        params.set('include_containers', String(includeContainers));
      }
      if (frameX !== undefined) params.set('frame_x', String(frameX));
      if (frameY !== undefined) params.set('frame_y', String(frameY));
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
