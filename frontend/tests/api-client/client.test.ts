import { describe, it, expect, vi } from 'vitest';
import { createApiClient, ApiError } from '../../src/api-client/index';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: (): Promise<unknown> => Promise.resolve(body),
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
      httpStatus: 400,
    });
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
});

// ── T-06 ─────────────────────────────────────────────────────────────────────

describe('network errors', () => {
  it('T-06 network failure throws ApiError with code network_error', async () => {
    const mock = makeNetworkError();
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.getWorldMetadata('any')).rejects.toMatchObject({
      code: 'network_error',
      httpStatus: 0,
    });
    await expect(client.getWorldMetadata('any')).rejects.toThrow(ApiError);
  });
});

// ── T-07 ─────────────────────────────────────────────────────────────────────

describe('deleteWorld', () => {
  it('T-07 deleteWorld swallows 404', async () => {
    const mock = makeFetch(404, { error: { code: 'world_not_found', message: 'Not found' } });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.deleteWorld('non-existent')).resolves.toBeUndefined();
  });

  it('T-07b deleteWorld resolves on 204', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() });
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
