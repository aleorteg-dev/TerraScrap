import type { CanonicalCode } from './errorCodes';

// ── Error hierarchy ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly apiVersion?: string;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: unknown,
    apiVersion?: string
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
    this.apiVersion = apiVersion;
  }
}

export class UploadTooLargeError extends ApiError {}
export class WorldNotFoundError extends ApiError {}
export class ItemNotFoundError extends ApiError {}
export class ValidationError extends ApiError {}
export class InternalApiError extends ApiError {}
export class CatalogUnavailableError extends ApiError {}
export class InvalidEncodingError extends ApiError {}
export class CoordinatesOutOfBoundsError extends ApiError {}
export class ApiVersionMismatchError extends ApiError {}

// ── Code → class map (single point of extension) ─────────────────────────────

type ApiErrorCtor = new (
  code: string,
  status: number,
  message: string,
  details?: unknown,
  apiVersion?: string
) => ApiError;

const ERROR_CODE_MAP: Partial<Record<CanonicalCode, ApiErrorCtor>> = {
  upload_too_large: UploadTooLargeError,
  world_not_found: WorldNotFoundError,
  item_not_found: ItemNotFoundError,
  validation_error: ValidationError,
  internal_error: InternalApiError,
  catalog_unavailable: CatalogUnavailableError,
  invalid_encoding: InvalidEncodingError,
  coordinates_out_of_bounds: CoordinatesOutOfBoundsError,
  invalid_coordinates: CoordinatesOutOfBoundsError,
};

// ── parseError ────────────────────────────────────────────────────────────────

function isErrorPayload(
  v: unknown
): v is { error: { code: string; message: string; details?: unknown } } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const inner = (v as Record<string, unknown>)['error'];
  if (typeof inner !== 'object' || inner === null) return false;
  const err = inner as Record<string, unknown>;
  return typeof err['code'] === 'string' && typeof err['message'] === 'string';
}

export async function parseError(response: Response): Promise<ApiError> {
  const apiVersion = response.headers.get('X-API-Version') ?? undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(
      'unknown_error',
      response.status,
      'Unknown server error',
      undefined,
      apiVersion
    );
  }

  if (isErrorPayload(body)) {
    const { code, message, details } = body.error;
    const Ctor = ERROR_CODE_MAP[code as CanonicalCode] ?? ApiError;
    return new Ctor(code, response.status, message, details, apiVersion);
  }

  return new ApiError(
    'unknown_error',
    response.status,
    'Unknown server error',
    undefined,
    apiVersion
  );
}
