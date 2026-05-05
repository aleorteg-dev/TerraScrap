import { describe, it, expect, vi } from 'vitest';
import type { components } from '../../src/api-client/__generated__/schema';
import {
  ApiError,
  UploadTooLargeError,
  WorldNotFoundError,
  ValidationError,
  InternalApiError,
  parseError,
} from '../../src/api-client/errors';
import { createApiClient } from '../../src/api-client/client';

// ── mock helpers ──────────────────────────────────────────────────────────────

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: (): Promise<unknown> => Promise.resolve(body),
    headers: {
      get: (name: string): string | null => headers[name] ?? null,
    },
  } as unknown as Response;
}

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue(makeResponse(status, body, headers));
}

function asFetch(mock: ReturnType<typeof vi.fn>): typeof fetch {
  return mock as unknown as typeof fetch;
}

function errBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

// ── parseError ────────────────────────────────────────────────────────────────

describe('parseError', () => {
  it('test_parse_error_413_returns_upload_too_large_instance', async () => {
    const res = makeResponse(413, errBody('upload_too_large', 'File too large'));
    const err = await parseError(res);
    expect(err).toBeInstanceOf(UploadTooLargeError);
    expect(err.code).toBe('upload_too_large');
    expect(err.status).toBe(413);
  });

  it('test_parse_error_422_returns_validation_error_with_details', async () => {
    const details = [{ loc: ['body'], msg: 'required', type: 'missing' }];
    const res = makeResponse(422, errBody('validation_error', 'Validation failed', details));
    const err = await parseError(res);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('validation_error');
    expect(err.status).toBe(422);
    expect(err.details).toEqual(details);
  });

  it('test_parse_error_404_returns_world_not_found', async () => {
    const res = makeResponse(404, errBody('world_not_found', 'World not found'));
    const err = await parseError(res);
    expect(err).toBeInstanceOf(WorldNotFoundError);
    expect(err.code).toBe('world_not_found');
    expect(err.status).toBe(404);
  });

  it('test_parse_error_500_returns_internal_api_error', async () => {
    const res = makeResponse(500, errBody('internal_error', 'Internal error'));
    const err = await parseError(res);
    expect(err).toBeInstanceOf(InternalApiError);
    expect(err.status).toBe(500);
  });

  it('test_parse_error_unknown_code_falls_back_to_generic_apierror', async () => {
    const res = makeResponse(400, errBody('some_future_code', 'Unknown code'));
    const err = await parseError(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.constructor).toBe(ApiError);
    expect(err.code).toBe('some_future_code');
  });

  it('test_parse_error_reads_x_api_version_header_into_field', async () => {
    const res = makeResponse(404, errBody('world_not_found', 'Not found'), {
      'X-API-Version': 'v0.1.0',
    });
    const err = await parseError(res);
    expect(err.apiVersion).toBe('v0.1.0');
  });
});

// ── client typed errors ───────────────────────────────────────────────────────

describe('client typed errors', () => {
  it('test_client_throws_typed_error_on_non_ok_response', async () => {
    const mock = makeFetch(422, errBody('validation_error', 'Bad input'));
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.searchItems('test')).rejects.toBeInstanceOf(ValidationError);
  });

  it('test_client_propagates_details_field_when_present', async () => {
    const details = { field: 'q', reason: 'required' };
    const mock = makeFetch(422, errBody('validation_error', 'Bad input', details));
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    await expect(client.searchItems('test')).rejects.toMatchObject({ details });
  });

  it('test_get_items_happy_path_returns_typed_array', async () => {
    const items = [{ id: 1, name: 'Item', sprite_url: '', category: 'weapon' }];
    const mock = makeFetch(200, { items });
    const client = createApiClient({ fetchImpl: asFetch(mock) });

    const result = await client.searchItems('item');
    expect(result).toEqual(items);
  });
});

// ── generated types shape ─────────────────────────────────────────────────────

describe('generated types shape', () => {
  it('test_generated_types_have_error_dto_shape', () => {
    const fixture = {
      error: {
        code: 'test_code',
        message: 'test message',
      },
    } satisfies components['schemas']['ErrorDto'];
    expect(fixture.error.code).toBe('test_code');
    expect(fixture.error.message).toBe('test message');
  });
});
