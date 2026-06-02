import { describe, it, expect, vi } from 'vitest';
import {
  createApiClient,
  ApiError,
  WorldNotFoundError,
  CatalogUnavailableError,
  InvalidEncodingError,
  CoordinatesOutOfBoundsError,
  ApiVersionMismatchError,
} from '../../src/api-client/index';

// ── helpers ──────────────────────────────────────────────────────────────────

const V02 = { 'X-API-Version': '0.2' };

function makeFetch(status: number, body: unknown, headers: Record<string, string> = V02) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: (): Promise<unknown> => Promise.resolve(body),
    headers: {
      get: (name: string): string | null => headers[name] ?? null,
    },
  });
}

function makeNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

function asFetch(mock: ReturnType<typeof vi.fn>): typeof fetch {
  return mock as unknown as typeof fetch;
}

const WORLD_META = {
  name: 'Test World',
  width: 4200,
  height: 1200,
  version: 279,
  seed: '42',
  size: 'small' as const,
  hardmode: false,
  spawn_x: 2100,
  spawn_y: 350,
  world_surface_y: 320,
  rock_layer_y: 900,
  hell_layer_y: 1100,
};

// ── T-01 ─────────────────────────────────────────────────────────────────────

describe('uploadWorld', () => {
  it('T-01 uploadWorld sends multipart and returns worldId', async () => {
    const mock = makeFetch(200, { world_id: 'abc-123', metadata: WORLD_META });
    const client = createApiClient({ fetchImpl: asFetch(mock) });
    const file = new File(['data'], 'world.wld');

    const result = await client.uploadWorld(file);

    expect(result.worldId).toBe('abc-123');
    expect(result.metadata.name).toBe('Test World');
    expect(mock).toHaveBeenCalledWith('/api/worlds', expect.objectContaining({ method: 'POST' }));
    const lastCall = mock.mock.lastCall as [string, RequestInit] | undefined;
    expect(lastCall?.[1]?.body).toBeInstanceOf(FormData);
  });

  it('T-02 uploadWorld on 400 throws ApiError with code invalid_wld', async () => {
    const mock = makeFetch(400, {
      error: { code: 'invalid_wld', message: 'Not a valid .wld file' },
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });
    const file = new File(['bad'], 'world.wld');

    await expect(client.uploadWorld(file)).rejects.toThrow(ApiError);
    await expect(client.uploadWorld(file)).rejects.toMatchObject({
      code: 'invalid_wld',
      status: 400,
    });
  });

  it('T-14a uploadWorld onProgress callback receives monotonic 0..100 values', async () => {
    type Listener = (ev: ProgressEvent) => void;
    const upload = {
      onprogress: null as Listener | null,
      onerror: null as (() => void) | null,
    };
    const xhr: Partial<XMLHttpRequest> & {
      upload: typeof upload;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      open: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      getResponseHeader: (n: string) => string | null;
      status: number;
      responseText: string;
      responseType: string;
    } = {
      upload,
      onload: null,
      onerror: null,
      status: 200,
      responseText: JSON.stringify({ world_id: 'wid', metadata: WORLD_META }),
      responseType: 'text',
      open: vi.fn(),
      send: vi.fn().mockImplementation(function (this: typeof xhr) {
        // Simulate three progress events then load.
        const fire = (loaded: number): void => {
          upload.onprogress?.({
            lengthComputable: true,
            loaded,
            total: 1000,
          } as unknown as ProgressEvent);
        };
        fire(250);
        fire(500);
        fire(990);
        this.onload?.();
      }),
      getResponseHeader: (name: string) => (name.toLowerCase() === 'x-api-version' ? '0.2' : null),
    };
    const client = createApiClient({
      fetchImpl: asFetch(vi.fn()),
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });

    const calls: number[] = [];
    const onProgress = (pct: number): void => {
      calls.push(pct);
    };

    const result = await client.uploadWorld(new File(['x'], 'w.wld'), { onProgress });

    expect(result.worldId).toBe('wid');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < calls.length; i++) {
      const prev = calls[i - 1] ?? 0;
      const cur = calls[i] ?? 0;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
    for (const v of calls) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(calls[calls.length - 1]).toBe(100);
  });
});

// ── T-03 ─────────────────────────────────────────────────────────────────────

describe('getWorldMetadata', () => {
  it('T-03 getWorldMetadata returns typed metadata', async () => {
    const mock = makeFetch(200, WORLD_META);
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.getWorldMetadata('world-id-1');

    expect(result).toEqual(WORLD_META);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('/api/worlds/world-id-1'), undefined);
  });
});

// ── T-04 ─────────────────────────────────────────────────────────────────────

describe('searchInWorld', () => {
  it('T-04 searchInWorld sends item_id query and returns matches', async () => {
    const payload = {
      item_id: 757,
      total: 1,
      matches: [{ x: 100, y: 200, source: 'chest', chest_id: 5, stack: 1 }],
    };
    const mock = makeFetch(200, payload);
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.searchInWorld('world-id-1', 757);

    expect(result.item_id).toBe(757);
    expect(result.matches).toHaveLength(1);
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('/api/worlds/world-id-1/search'),
      undefined
    );
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('item_id=757'), undefined);
  });

  it('T-04b searchInWorld sends frame filters and include_containers options', async () => {
    const mock = makeFetch(200, { item_id: 21, total: 0, matches: [] });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await client.searchInWorld('world-id-1', 21, {
      includeContainers: false,
      frameX: 300,
      frameY: 18,
    });

    expect(mock).toHaveBeenCalledWith(expect.stringContaining('item_id=21'), undefined);
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('include_containers=false'),
      undefined
    );
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('frame_x=300'), undefined);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('frame_y=18'), undefined);
  });
});

// ── T-05 ─────────────────────────────────────────────────────────────────────

describe('searchItems', () => {
  it('T-05 searchItems passes q and limit as query params', async () => {
    const mock = makeFetch(200, {
      items: [{ id: 757, name: 'Zenith', sprite_url: '', category: 'weapon' }],
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.searchItems('zenith', 5);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 757, name: 'Zenith' });
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('q=zenith'), undefined);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('limit=5'), undefined);
  });

  it('T-05b searchItems forwards AbortSignal to fetch as init.signal', async () => {
    const mock = makeFetch(200, { items: [] });
    const client = createApiClient({ fetchImpl: asFetch(mock) });
    const controller = new AbortController();

    await client.searchItems('zen', undefined, { signal: controller.signal });

    const lastCall = mock.mock.lastCall as [string, RequestInit | undefined] | undefined;
    expect(lastCall?.[1]?.signal).toBe(controller.signal);
  });

  it('T-05c searchItems rejects when AbortSignal aborts mid-flight', async () => {
    const controller = new AbortController();
    const abortFetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new DOMException('aborted', 'AbortError');
            reject(err);
          });
        })
    );
    const client = createApiClient({ fetchImpl: asFetch(abortFetch) });
    const promise = client.searchItems('zen', undefined, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'network_error' });
  });
});

// ── T-06 ─────────────────────────────────────────────────────────────────────

describe('network errors', () => {
  it('T-06 network failure throws ApiError with code network_error', async () => {
    const mock = makeNetworkError();
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getWorldMetadata('any')).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
    await expect(client.getWorldMetadata('any')).rejects.toThrow(ApiError);
  });
});

// ── T-07 ─────────────────────────────────────────────────────────────────────

describe('deleteWorld', () => {
  it('T-07 deleteWorld throws WorldNotFoundError on 404 (v0.2 strict)', async () => {
    const mock = makeFetch(404, { error: { code: 'world_not_found', message: 'Not found' } });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.deleteWorld('non-existent')).rejects.toBeInstanceOf(WorldNotFoundError);
  });

  it('T-07b deleteWorld resolves on 204', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
      headers: { get: (n: string): string | null => (V02 as Record<string, string>)[n] ?? null },
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.deleteWorld('world-id-1')).resolves.toBeUndefined();
  });
});

// ── T-08 ─────────────────────────────────────────────────────────────────────

describe('baseUrl', () => {
  it('T-08 baseUrl can be overridden via opts', async () => {
    const mock = makeFetch(200, WORLD_META);
    const client = createApiClient({
      baseUrl: 'http://custom:9000/api',
      fetchImpl: asFetch(mock),
    });

    await client.getWorldMetadata('wid');

    expect(mock).toHaveBeenCalledWith(expect.stringContaining('http://custom:9000/api'), undefined);
  });
});

// ── T-10 getItem ─────────────────────────────────────────────────────────────

describe('getItem', () => {
  it('T-10 getItem returns ItemDetail on 200', async () => {
    const detail = { id: 757, name: 'Zenith', sprite_url: '', category: 'weapon', rarity: 10 };
    const mock = makeFetch(200, detail);
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.getItem(757);

    expect(result).toEqual(detail);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('/api/items/757'), undefined);
  });

  it('T-10b getItem on 503 throws CatalogUnavailableError', async () => {
    const mock = makeFetch(503, {
      error: { code: 'catalog_unavailable', message: 'Catalog unavailable' },
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getItem(1)).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

// ── T-11 listNpcs ────────────────────────────────────────────────────────────

describe('listNpcs', () => {
  it('T-11 listNpcs returns Npc[] from NpcListDto', async () => {
    const npcs = [
      { id: 17, name: 'Guide', type: 'town', x: 4200, y: 348 },
      { id: 18, name: 'Merchant', type: 'town', x: 4205, y: 348 },
    ];
    const mock = makeFetch(200, { npcs });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.listNpcs('w1');

    expect(result).toEqual(npcs);
    expect(mock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/worlds\/w1\/npcs(\?|$)/),
      undefined
    );
  });

  it('T-11b listNpcs sends town_only=true when opts.townOnly=true', async () => {
    const mock = makeFetch(200, { npcs: [] });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await client.listNpcs('w1', { townOnly: true });

    expect(mock).toHaveBeenCalledWith(expect.stringContaining('town_only=true'), undefined);
  });
});

// ── T-12 getTileDetail ───────────────────────────────────────────────────────

describe('getTileDetail', () => {
  it('T-12 getTileDetail returns TileDetail and sends x/y query', async () => {
    const tile = {
      x: 10,
      y: 20,
      tile_id: 1,
      wall_id: 0,
      liquid_type: 'none',
      liquid_amount: 0,
      frame_x: null,
      frame_y: null,
      chest_id: null,
      sign_id: null,
      tile_entity_id: null,
    };
    const mock = makeFetch(200, tile);
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.getTileDetail('w1', 10, 20);

    expect(result).toEqual(tile);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('/api/worlds/w1/tile?'), undefined);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('x=10'), undefined);
    expect(mock).toHaveBeenCalledWith(expect.stringContaining('y=20'), undefined);
  });

  it('T-12b getTileDetail on 400 invalid_coordinates throws CoordinatesOutOfBoundsError', async () => {
    const mock = makeFetch(400, {
      error: { code: 'coordinates_out_of_bounds', message: 'Out of bounds' },
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getTileDetail('w1', -1, 0)).rejects.toBeInstanceOf(
      CoordinatesOutOfBoundsError
    );
  });
});

// ── T-13 getTilesChunk encoding ──────────────────────────────────────────────

describe('getTilesChunk encoding', () => {
  it('T-13 getTilesChunk passes encoding=base64-rle-v2 query when provided', async () => {
    const mock = makeFetch(200, {
      chunk_x: 0,
      chunk_y: 0,
      width: 128,
      height: 128,
      encoding: 'base64-rle-v2',
      payload: '',
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await client.getTilesChunk('w1', 0, 0, 128, 'base64-rle-v2');

    expect(mock).toHaveBeenCalledWith(expect.stringContaining('encoding=base64-rle-v2'), undefined);
  });

  it('T-13b getTilesChunk on 400 invalid_encoding throws InvalidEncodingError', async () => {
    const mock = makeFetch(400, {
      error: { code: 'invalid_encoding', message: 'Unknown encoding' },
    });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getTilesChunk('w1', 0, 0, 128, 'base64-rle-v1')).rejects.toBeInstanceOf(
      InvalidEncodingError
    );
  });
});

// ── T-15 X-API-Version validation ────────────────────────────────────────────

describe('X-API-Version validation', () => {
  it('T-15a happy path with X-API-Version 0.2 does not throw', async () => {
    const mock = makeFetch(200, WORLD_META, { 'X-API-Version': '0.2' });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getWorldMetadata('w1')).resolves.toEqual(WORLD_META);
  });

  it('T-15b mismatched X-API-Version 0.1 throws ApiVersionMismatchError', async () => {
    const mock = makeFetch(200, WORLD_META, { 'X-API-Version': '0.1' });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getWorldMetadata('w1')).rejects.toBeInstanceOf(ApiVersionMismatchError);
  });

  it('T-15c absent X-API-Version does not throw (lenient)', async () => {
    const mock = makeFetch(200, WORLD_META, {});
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getWorldMetadata('w1')).resolves.toEqual(WORLD_META);
  });
});
