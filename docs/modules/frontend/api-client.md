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

// ── Client interface ───────────────────────────────────────────────
interface ApiClient {
  uploadWorld(file: File): Promise<{ worldId: string; metadata: WorldMetadata }>;
  getWorldMetadata(worldId: string): Promise<WorldMetadata>;
  getTilesChunk(worldId: string, chunkX: number, chunkY: number, chunkSize?: number): Promise<TilesChunk>;
  searchItems(query: string, limit?: number): Promise<ItemSummary[]>;
  searchInWorld(worldId: string, itemId: number, includeContainers?: boolean): Promise<SearchResult>;
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

El cliente NO valida `X-API-Version` todavía (planned follow-up); sí lo lee y lo expone en `ApiError.apiVersion` para diagnóstico.

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
- **Versión del contrato consumida**: api-contract.md v0.2
- **Versión OpenAPI**: snapshot v0.2 en `docs/contracts/openapi.json` (iter-11)
- **Último cierre**: 2026-05-10 (iter-14)
- **Iteración actual**: cerrada

## 14. Decisiones tomadas

### Iter-007
- Se usó `vi.fn()` + cast `as unknown as typeof fetch` para mockear fetch en tests (MSW descartado: overkill para un cliente puro sin DOM).
- `uploadWorld` mapea manualmente `world_id → worldId` (snake_case backend → camelCase frontend).
- `searchItems` desenvuelve `ItemListDto.items` y devuelve `ItemSummary[]` directamente.
- `deleteWorld` tolera 404 sin lanzar (SP-06 idempotente).
- `vitest.config.ts` separado de `vite.config.ts` para evitar conflicto de tipos en `tsc -b`.
- `npm install --legacy-peer-deps` necesario: `openapi-typescript@7` declara peer `typescript@^5.x` pero el scaffold usa TypeScript 6.

### Iter-031
- `ApiError.httpStatus` renombrado a `status` para alinear con el contrato del doc. Los consumidores (F2, F4) solo acceden a `.message` y usan el constructor posicionalmente → sin breaking change.
- `parseError(response)` lee `X-API-Version` del header y lo expone en `ApiError.apiVersion`; no valida la versión todavía (anotado como follow-up).
- `new.target.name` en el constructor base hace que cada subclase tenga el nombre correcto sin repetir lógica.
- `ERROR_CODE_MAP` usa `Partial<Record<CanonicalCode, ApiErrorCtor>>` para que `noUncheckedIndexedAccess` obligue a manejar el caso `undefined` (→ fallback a `ApiError`).
- `makeFetch` en tests actualizado para incluir `headers.get()` mock, necesario tras centralizar el parseo en `parseError`.

## 15. Deuda / follow-ups
- `npm install --legacy-peer-deps`: actualizar `openapi-typescript` cuando publique soporte oficial para TypeScript 6.
- `searchInWorld` aún no admite `frameX/frameY` opcionales (el backend ya los acepta tras iter-11). Pendiente para iteración futura.

### Evolución propuesta para paridad con TerraMap (estado)

- `searchInWorld` con `frameX/frameY`: pendiente (deuda activa).
