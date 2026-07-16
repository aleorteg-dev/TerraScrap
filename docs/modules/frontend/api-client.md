# Módulo `F1 – api-client`

## 1. Propósito
Cliente HTTP tipado que encapsula toda la comunicación con el backend. Oculta `fetch`, gestiona errores homogéneos y expone funciones por recurso. Los tipos se **generan** desde el OpenAPI del backend.

## 2. Contrato público

```ts
// src/api-client/index.ts
export type WorldMetadata = components["schemas"]["WorldMetadataDto"];
export type SearchMatch = components["schemas"]["SearchMatchDto"];
export type SearchResult = components["schemas"]["SearchResultDto"];
export type ItemSummary = components["schemas"]["ItemSummaryDto"];
export type TilesChunk = components["schemas"]["TilesChunkDto"]; // incluye surface_y?: number[] | null

// ── Error hierarchy ────────────────────────────────────────────────
class ApiError extends Error {
  readonly code: string;
  readonly status: number;           // HTTP status (0 for network errors)
  readonly details?: unknown;
  readonly apiVersion?: string;      // X-API-Version header value, if present
}

class UploadTooLargeError extends ApiError  // code: "upload_too_large"
class WorldNotFoundError  extends ApiError  // code: "world_not_found"
class ItemNotFoundError   extends ApiError  // code: "item_not_found"
class ValidationError     extends ApiError  // code: "validation_error"
class InternalApiError    extends ApiError  // code: "internal_error"
// unknown codes → ApiError (base class)

// ── parseError ─────────────────────────────────────────────────────
// Única ruta de conversión Response → error tipado.
// Lee X-API-Version del header; lo guarda en ApiError.apiVersion.
// Usa ERROR_CODE_MAP en errors.ts para despachar a la subclase correcta.
async function parseError(response: Response): Promise<ApiError>;

// ── Upload options (IT-02) ─────────────────────────────────────────
interface UploadOptions {
  onProgress?: (pct: number) => void;
  timeoutMs?: number; // timeout global de la fase de polling; default DEFAULT_IMPORT_TIMEOUT_MS
}
const DEFAULT_IMPORT_TIMEOUT_MS = 300_000; // 5 min, exportado

// ── Client interface ───────────────────────────────────────────────
interface ApiClient {
  uploadWorld(file: File, opts?: UploadOptions): Promise<{ worldId: string; metadata: WorldMetadata }>;
  getWorldMetadata(worldId: string): Promise<WorldMetadata>;
  getTilesChunk(worldId: string, chunkX: number, chunkY: number, chunkSize?: number): Promise<TilesChunk>;
  searchItems(query: string, limit?: number): Promise<ItemSummary[]>;
  searchInWorld(
    worldId: string,
    itemId: number,
    options?: SearchInWorldOptions | boolean
  ): Promise<SearchResult>;
  deleteWorld(worldId: string): Promise<void>;
}

function createApiClient(opts?: { baseUrl?: string; fetchImpl?: typeof fetch }): ApiClient;
```

## 3. Flujo de errores

Toda función cliente sigue:

```ts
if (!res.ok) throw await parseError(res);
```

No hay manejo ad-hoc por función. `parseError` es el único punto de conversión.

`deleteWorld` swallow 404 antes de llamar a `parseError` (SP-06 idempotente).

El cliente valida `X-API-Version` en `checkApiVersion()` (constante `EXPECTED_API_VERSION = '0.2'`); si el header presente difiere, lanza `ApiVersionMismatchError` (subclase de `ApiError`). El header también se expone en `ApiError.apiVersion` para diagnóstico cuando aparece en respuestas de error.

### Polling de import jobs (`uploadWorld` con `onProgress`) — IT-02

El bucle de polling de `pollImportJob` está **acotado** (E03). Contrato:

- **Timeout global**: si el job no alcanza estado terminal en `timeoutMs`
  (default `DEFAULT_IMPORT_TIMEOUT_MS = 300 000` ms = 5 min desde el inicio del
  polling), rechaza con `ApiError`, `code: "import_timeout"`, `status: 0`.
- **Errores de red**: un fallo de red en el GET del job se reintenta tras el
  intervalo; **3 fallos consecutivos** rechazan con `ApiError`,
  `code: "import_error"`. Un poll exitoso resetea el contador.
- **Job desaparecido / error HTTP**: cualquier respuesta de error HTTP del poll
  (p. ej. 404 `job_not_found` — retención de 15 min del servidor, api-contract §2)
  rechaza **inmediatamente** con `ApiError`, `code: "import_error"`,
  `details.cause` = código original. `ApiVersionMismatchError` se propaga tal cual.
- **Job en `status:"error"`**: sin cambios — rechaza con el `error_code` del job
  (`invalid_wld`, `unsupported_version`, `import_failed`, …).
- `timeoutMs` solo aplica a la ruta con `onProgress` (import job); la ruta simple
  `POST /worlds` no hace polling.

## 4. Regeneración de tipos

```bash
cd frontend
npm run generate:api-types   # alias: npm run gen:api
```

Fuente de verdad: `docs/contracts/openapi.json` (snapshot commiteado del backend).
Salida: `src/api-client/__generated__/schema.d.ts` — **no editar a mano**.

## 5. Dependencias
- Tipos generados con `openapi-typescript` desde `docs/contracts/openapi.json`.
- No depende de React. Es framework-agnostic.

## 6. No objetivos
- No gestiona estado (caché, React Query…). Puede envolverse fuera.
- No implementa retries complejos en v1.

## 7. Especificación (SDD)
- **SP-01** Cada función HTTP exitosa resuelve con el DTO tipado.
- **SP-02** Cualquier respuesta con body `{error:{code,message}}` se traduce en `throw await parseError(response)`.
- **SP-03** Errores de red → `ApiError` con `code: "network_error"` y `status: 0`.
- **SP-04** `baseUrl` por defecto es `/api`; configurable via opts o env `VITE_API_BASE_URL`.
- **SP-05** `uploadWorld` usa `multipart/form-data` y reporta progreso opcional (v2).
- **SP-06** `deleteWorld` tolera 404 sin lanzar (`idempotente`) — decisión UX.
- **SP-07** El polling de import job rechaza con `import_timeout` al agotar `timeoutMs` (default 5 min) (IT-02).
- **SP-08** 3 errores de red consecutivos en el polling rechazan con `import_error`; un poll exitoso resetea el contador (IT-02).
- **SP-09** Una respuesta de error HTTP del poll (p. ej. 404 `job_not_found`) rechaza inmediatamente con `import_error` (IT-02).

## 8. Códigos de error canónicos (api-contract.md v0.2)

| Código | Subclase | HTTP |
|---|---|---|
| `upload_too_large` | `UploadTooLargeError` | 413 |
| `world_not_found` | `WorldNotFoundError` | 404 |
| `item_not_found` | `ItemNotFoundError` | 404 |
| `validation_error` | `ValidationError` | 422 |
| `internal_error` | `InternalApiError` | 500 |
| `catalog_unavailable` | `CatalogUnavailableError` | 503 |
| `invalid_encoding` | `InvalidEncodingError` | 400 |
| `coordinates_out_of_bounds` / `invalid_coordinates` | `CoordinatesOutOfBoundsError` | 400 |
| `api_version_mismatch` (cliente) | `ApiVersionMismatchError` | * |
| `import_timeout` (cliente, IT-02) | `ApiError` (base) | 0 |
| `import_error` (cliente, IT-02) | `ApiError` (base) | 0 o status del poll |
| otros | `ApiError` (base) | variable |

Map vive en `src/api-client/errors.ts → ERROR_CODE_MAP`.
Tipo canónico vive en `src/api-client/errorCodes.ts → CanonicalCode`.

## 9. Plan de tests (TDD)

### Iter-007 (cerrados)
- [x] `T-01 uploadWorld sends multipart and returns worldId`
- [x] `T-02 uploadWorld on 400 throws ApiError with code invalid_wld`
- [x] `T-03 getWorldMetadata returns typed metadata`
- [x] `T-04 searchInWorld sends item_id query and returns matches`
- [x] `T-05 searchItems passes q and limit as query params`
- [x] `T-06 network failure throws ApiError with code network_error`
- [x] `T-07 deleteWorld swallows 404`
- [x] `T-07b deleteWorld resolves on 204`
- [x] `T-08 baseUrl can be overridden via opts`

### Iter-031 (cerrados)
- [x] `test_parse_error_413_returns_upload_too_large_instance`
- [x] `test_parse_error_422_returns_validation_error_with_details`
- [x] `test_parse_error_404_returns_world_not_found`
- [x] `test_parse_error_500_returns_internal_api_error`
- [x] `test_parse_error_unknown_code_falls_back_to_generic_apierror`
- [x] `test_parse_error_reads_x_api_version_header_into_field`
- [x] `test_client_throws_typed_error_on_non_ok_response`
- [x] `test_client_propagates_details_field_when_present`
- [x] `test_generated_types_have_error_dto_shape`
- [x] `test_get_items_happy_path_returns_typed_array` (regresión)

### IT-02 (cerrados, 2026-07-16)
- [x] `T-15a uploadWorld should reject with import_timeout when polling exceeds timeoutMs`
- [x] `T-15b uploadWorld should reject with import_timeout after the default 5 min`
- [x] `T-15c uploadWorld should reject with import_error when the job poll returns 404`
- [x] `T-15d uploadWorld should reject with import_error after 3 consecutive network failures`
- [x] `T-15e uploadWorld should recover when network errors are not consecutive`

## 10. Verificación manual (iter-031)
- Upload > límite → `UploadTooLargeError` en consola del navegador (pendiente: docker up).
- Mundo inexistente → `WorldNotFoundError` en consola del navegador (pendiente: docker up).

## 11. Notas de implementación
- Script `npm run generate:api-types` (alias: `gen:api`) ejecuta `openapi-typescript` contra `docs/contracts/openapi.json`. Commitea el diff de `__generated__/schema.d.ts` tras regenerar.
- `parseError()` centraliza parseo de error; cada función usa `if (!res.ok) throw await parseError(res)`.
- `isErrorPayload()` guard privado en `errors.ts`.

## 12. Performance
- Evitar leer `response.text()` antes del JSON para no doblar memoria con payloads grandes (tiles).

## 13. Estado
- **Versión del contrato consumida**: api-contract.md v0.2 (incl. retención de import jobs, IT-01)
- **Versión OpenAPI**: snapshot v0.2 en `docs/contracts/openapi.json` (actualizado 2026-06-11 con `TilesChunkDto.surface_y`)
- **Último cierre**: 2026-07-16 (IT-02 remediación — E03 polling acotado: `timeoutMs`, `import_timeout`/`import_error`)
- **Iteración actual**: cerrada

## 14. Decisiones tomadas

### Iter-007
- Se usó `vi.fn()` + cast `as unknown as typeof fetch` para mockear fetch en tests (MSW descartado: overkill para un cliente puro sin DOM).
- `uploadWorld` mapea manualmente `world_id → worldId` (snake_case backend → camelCase frontend).
- `searchItems` desenvuelve `ItemListDto.items` y devuelve `ItemSummary[]` directamente.
- `deleteWorld` tolera 404 sin lanzar (SP-06 idempotente).
- `vitest.config.ts` separado de `vite.config.ts` para evitar conflicto de tipos en `tsc -b`.
- `npm install --legacy-peer-deps` ya no es necesario: el proyecto fija `typescript@~5.9.3`, compatible con `openapi-typescript@7.13.0`.

### Iter-031
- `ApiError.httpStatus` renombrado a `status` para alinear con el contrato del doc. Los consumidores (F2, F4) solo acceden a `.message` y usan el constructor posicionalmente → sin breaking change.
- `parseError(response)` lee `X-API-Version` del header y lo expone en `ApiError.apiVersion`; no valida la versión todavía (anotado como follow-up).
- `new.target.name` en el constructor base hace que cada subclase tenga el nombre correcto sin repetir lógica.
- `ERROR_CODE_MAP` usa `Partial<Record<CanonicalCode, ApiErrorCtor>>` para que `noUncheckedIndexedAccess` obligue a manejar el caso `undefined` (→ fallback a `ApiError`).
- `makeFetch` en tests actualizado para incluir `headers.get()` mock, necesario tras centralizar el parseo en `parseError`.

### IT-02 (2026-07-16)
- `pollImportJob` acotado (cierra E03): deadline con `Date.now()` (compatible con los
  fake timers de Vitest, que también mockean `Date`), contador de errores de red
  consecutivos con reset en poll exitoso, y rechazo inmediato ante error HTTP del poll.
- `import_timeout` / `import_error` añadidos a `CanonicalCode` como códigos de cliente
  (misma categoría que `network_error`): nunca viajan por el wire, no tocan
  `api-contract.md` ni el OpenAPI. Sin subclase propia en `ERROR_CODE_MAP` (base
  `ApiError`), igual que `network_error`.
- `DEFAULT_IMPORT_TIMEOUT_MS` (300 000) exportado desde `index.ts` para que los
  consumidores (F2) puedan mostrar mensajes coherentes.
- El error HTTP original del poll se conserva en `details.cause` del `import_error`.

## 15. Deuda / follow-ups
- `npm install --legacy-peer-deps`: cerrado fijando `typescript@~5.9.3`, compatible con `openapi-typescript@7.13.0`.
- `searchInWorld` admite `frameX/frameY` opcionales mediante `SearchInWorldOptions`; conserva compatibilidad temporal con el tercer argumento booleano.
- **IT-02**: `uploadWorld` aún no admite `AbortSignal` para cancelar la fase de polling
  (el plan lo marca como opcional; `searchItems` ya tiene el patrón). Si F2/F6 necesitan
  cancelación de subida, añadir `signal?: AbortSignal` a `UploadOptions` en una iteración
  futura de F1.

### Evolución propuesta para paridad con TerraMap (estado)

- `searchInWorld` con `frameX/frameY`: implementado en F1; pendiente solo UI específica para seleccionar frames desde F4/F6.
