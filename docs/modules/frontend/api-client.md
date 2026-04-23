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

export interface ApiClient {
  uploadWorld(file: File): Promise<{ worldId: string; metadata: WorldMetadata }>;
  getWorldMetadata(worldId: string): Promise<WorldMetadata>;
  getTilesChunk(worldId: string, chunkX: number, chunkY: number, chunkSize?: number): Promise<TilesChunk>;
  searchItems(query: string, limit?: number): Promise<ItemSummary[]>;
  searchInWorld(worldId: string, itemId: number, includeContainers?: boolean): Promise<SearchResult>;
  deleteWorld(worldId: string): Promise<void>;
}

export function createApiClient(opts?: { baseUrl?: string; fetchImpl?: typeof fetch }): ApiClient;

export class ApiError extends Error {
  code: string;
  httpStatus: number;
  details?: unknown;
}
```

## 3. Dependencias
- Tipos generados con `openapi-typescript` desde `docs/contracts/openapi.json`.
- No depende de React. Es framework-agnostic.

## 4. No objetivos
- No gestiona estado (caché, React Query…). Puede envolverse fuera.
- No implementa retries complejos en v1.

## 5. Especificación (SDD)
- **SP-01** Cada función HTTP exitosa resuelve con el DTO tipado.
- **SP-02** Cualquier respuesta con body `{error:{code,message}}` se traduce en un `throw new ApiError(...)`.
- **SP-03** Errores de red → `ApiError` con `code: "network_error"` y `httpStatus: 0`.
- **SP-04** `baseUrl` por defecto es `/api`; configurable via opts o env `VITE_API_BASE_URL`.
- **SP-05** `uploadWorld` usa `multipart/form-data` y reporta progreso opcional (v2).
- **SP-06** `deleteWorld` tolera 404 sin lanzar (`idempotente`) — decisión UX.

## 6. Plan de tests (TDD)
Usar `msw` (Mock Service Worker) o un `fetch` mockeado.

- [ ] `T-01 uploadWorld sends multipart and returns worldId`
- [ ] `T-02 uploadWorld on 400 throws ApiError with code invalid_wld`
- [ ] `T-03 getWorldMetadata returns typed metadata`
- [ ] `T-04 searchInWorld sends item_id query and returns matches`
- [ ] `T-05 searchItems passes q and limit as query params`
- [ ] `T-06 network failure throws ApiError with code network_error`
- [ ] `T-07 deleteWorld swallows 404`
- [ ] `T-08 baseUrl can be overridden via opts`

## 7. Notas de implementación
- Script `npm run gen:api` que ejecuta `openapi-typescript` contra `docs/contracts/openapi.json`. Este JSON se exporta desde FastAPI en el módulo `api-rest` o `app-bootstrap` y se commitea.
- La función `request<T>()` interna centraliza parseo de error.

## 8. Performance
- Evitar leer `response.text()` antes del JSON para no doblar memoria con payloads grandes (tiles).

## 9. Errores
- `ApiError { code, httpStatus, details }`.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —