# Contrato de API — TerraScrap

> Fuente de verdad del acuerdo entre frontend y backend. Cualquier cambio aquí afecta a `api-rest` (backend) y `api-client` (frontend) y debe reflejarse en el changelog del `PROJECT.md`.
> La IA debe cargar este documento cuando la iteración toque la frontera cliente–servidor.

Versión: `v0.2`
Base path: `/api`
Serialización: `application/json` salvo upload (`multipart/form-data`).
Header obligatorio en toda respuesta: `X-API-Version: 0.2`.
Errores: siempre con forma `{ "error": { "code": string, "message": string, "details"?: any } }`.
Códigos transversales:
- **413**: `code: "upload_too_large"` canónico para cualquier límite de upload.
- **422** validación FastAPI: `code: "validation_error"`, `details` lista de errores normalizada.
- **HTTPException** sin código de dominio: `code: "http_error"`.
- **500** no controlado: `code: "internal_error"` sin trazas ni detalles internos.
- **503** catálogo no disponible: `code: "catalog_unavailable"` en `/api/items` y `/api/items/{id}`.

---

## 1. Recursos — v0.1 (compatible)

Los endpoints de esta sección fueron definidos en `v0.1.0` y permanecen vigentes en `v0.2`.
Los cambios de comportamiento respecto a v0.1 se marcan con **[v0.2]**.

### 1.1. Mundos

#### `POST /api/worlds`
Sube un fichero `.wld` y crea una sesión de mundo.

- **Body** (multipart): `file: <.wld binary>`
- **200**:
  ```json
  {
    "world_id": "uuid",
    "metadata": { /* WorldMetadataDto — ver §4.1 para campos v0.2 */ }
  }
  ```
  v0.1: `metadata` contiene `name, width, height, version, seed, size, hardmode`.
  **[v0.2]**: `metadata` incluye además `spawn_x, spawn_y, world_surface_y, rock_layer_y, hell_layer_y` (ver §4.1).
- **400**: archivo no es `.wld` válido (`code: "invalid_wld"`, `details: { parser_code: string | null }` — código interno del parser sin trazas ni rutas locales).
- **413**: archivo supera el límite (`code: "upload_too_large"`).
- **422**: versión no soportada (`code: "unsupported_version"`, `details: { version }`).

#### `GET /api/worlds/{world_id}`
Metadatos del mundo cargado.

- **200**: `WorldMetadataDto` (ver §4.1 para campos v0.2).
- **404**: `code: "world_not_found"`.

#### `DELETE /api/worlds/{world_id}`
Libera memoria de la sesión. **[v0.2] Estricto**: siempre 404 si el id no existe o ha expirado.

- **204**: mundo eliminado correctamente.
- **404**: `code: "world_not_found"` — id inexistente o TTL expirado.

> Implementado en iter-032 via `WorldRepository.delete_strict()`. En v0.1 un DELETE sobre id
> inexistente devolvía 204 silencioso (antipatrón eliminado).

#### `GET /api/worlds/{world_id}/tiles`
Devuelve tiles empaquetados para el renderer.

- **Query**: `chunk_x`, `chunk_y` (índices de chunk, no coordenadas absolutas), `chunk_size=128` (opcional).
  Coordenadas absolutas: `start_x = chunk_x * chunk_size`, `start_y = chunk_y * chunk_size`.
- **200**:
  ```json
  {
    "chunk_x": 0,
    "chunk_y": 0,
    "width": 128,
    "height": 128,
    "encoding": "base64-rle-v1 | base64-rle-v2",
    "payload": "…",
    "surface_y": [84, 83, 83, 82]
  }
  ```
- `TilesChunkDto.encoding` es el discriminador de versión; el cliente lo inspecciona antes de decodificar.
- `surface_y`: primer `y` con tile activo por cada columna absoluta cubierta por el chunk; si la columna
  no tiene tile activo, vale `world.height`. El renderer lo usa para distinguir cielo abierto de fondos
  subterráneos sin depender de un corte horizontal global.
- Encoding `base64-rle-v1` (v0.1, compatible): runs `(tileId:int16LE, count:uint16LE)`, 4 bytes/run.
  Aire = -1. Orden fila-mayor (y externo, x interno). Máx. run: 65535.
- **[v0.2]** Encoding `base64-rle-v2`: ver §4.2 para spec completo.
- **[v0.2]** Negociación: cliente solicita un encoding concreto vía query param
  `?encoding=base64-rle-v1|base64-rle-v2`. Valor por defecto: `base64-rle-v1`. Encoding
  desconocido → 400 `code:"invalid_encoding"` con `details.supported` listando los válidos.

#### `GET /api/worlds/{world_id}/search`
Busca un ítem en el mundo cargado.

- **Query**:
  - `item_id=<int>` (obligatorio)
  - `include_containers=true|false` (default `true`)
  - **[v0.2]** `frame_x=<int>` (opcional) — filtra tiles `source="block"` por frame_x exacto
  - **[v0.2]** `frame_y=<int>` (opcional) — filtra tiles `source="block"` por frame_y exacto
- Si se proveen `frame_x/frame_y`, solo se incluyen tiles cuyo `(frame_x, frame_y)` coincida exactamente.
- `include_containers=false` excluye únicamente `"chest"`. Los matches `"object"` (objetos/tile
  frames mapeados por B4) siguen apareciendo porque no son contenedores semánticos.
- **200**:
  ```json
  {
    "item_id": 757,
    "total": 4,
    "matches": [
      { "x": 1250, "y": 402, "source": "chest", "chest_id": 12, "stack": 1 },
      { "x": 3500, "y": 380, "source": "block" },
      { "x": 3500, "y": 381, "source": "wall" },
      { "x": 2100, "y": 300, "source": "object" }
    ]
  }
  ```
- `SearchMatchDto.source`: `"block" | "wall" | "chest" | "object"`. `"object"` es **[v0.2]** y representa objetos/tile frames buscables; `tile_entity` queda reservado para una futura versión de contrato.
- **400**: `code: "invalid_item_id"`.
- **404**: `code: "world_not_found"`.

### 1.2. Catálogo de ítems

#### `GET /api/items?q=<texto>&limit=20`
Autocompletado. Si `q` parsea como entero decimal positivo → búsqueda exacta por `item_id`. Query vacía → `items: []`.

- **200**:
  ```json
  {
    "items": [
      { "id": 757, "name": "Zenith", "sprite_url": "https://.../zenith.png", "category": "weapon" }
    ]
  }
  ```
- **[v0.2] 503**: `code: "catalog_unavailable"` — catálogo no cargado en memoria (implementado en iter-032).

#### `GET /api/items/{item_id}`
Detalle de un ítem.

- **200**:
  ```json
  { "id": 757, "name": "Zenith", "sprite_url": "...", "category": "weapon", "rarity": 10 }
  ```
- **404**: `code: "item_not_found"`.
- **[v0.2] 503**: `code: "catalog_unavailable"` — catálogo no cargado en memoria (implementado en iter-032).

---

## 2. Endpoints nuevos — v0.2 (vigente)

### `GET /api/worlds/{world_id}/tile?x=<int>&y=<int>`
Detalle de un único tile. Sirve al panel "tile-info" (F6).

- **200** → `TileDetailDto`:
  ```json
  {
    "x": 1234,
    "y": 405,
    "tile_id": 213,
    "wall_id": 2,
    "liquid_type": "none | water | lava | honey | shimmer",
    "liquid_amount": 128,
    "frame_x": 18,
    "frame_y": 0,
    "chest_id": null,
    "sign_id": null,
    "tile_entity_id": 7
  }
  ```
  - `chest_id`, `sign_id`, `tile_entity_id`: `int | null`.
  - `frame_x`, `frame_y`: `int | null` (null si el tile no es frame-important).
- **400**: `code: "invalid_coordinates"` — x o y no entero, o fuera del rango `[0, width)` / `[0, height)`.
- **404**: `code: "world_not_found"`.

### `GET /api/worlds/{world_id}/npcs`
Lista de NPCs del mundo cargado.

- **200** → `NpcListDto`:
  ```json
  {
    "npcs": [
      { "id": 17, "name": "Guide", "type": "town", "x": 4200, "y": 348 },
      { "id": 18, "name": "Merchant", "type": "town", "x": 4205, "y": 348 }
    ]
  }
  ```
  - `NpcDto.type`: `"town" | "banner"`.
  - `x`, `y`: coordenadas en tiles (int).
  - Lista vacía si el mundo no tiene NPCs.
- **404**: `code: "world_not_found"`.

### `POST /api/world-imports` · `GET /api/world-imports/{job_id}` — retención de jobs

> Los endpoints existen desde iter-08 en `openapi.json`/snapshot; su especificación
> completa (202 + polling + códigos) se incorporará a este documento en IT-DOC-1 (G03).
> Esta subsección fija desde ya el contrato de **retención** (IT-01).

- Un job en estado terminal (`done` | `error`) se retiene **15 minutos** (900 s,
  configurable con `job_ttl_seconds` en `create_router`) desde que alcanza el estado
  terminal. Pasado ese plazo el job se purga del servidor.
- **`GET /api/world-imports/{job_id}` de un job expirado o desconocido** → 404
  `code: "job_not_found"` (mismo error en ambos casos; el cliente no puede distinguirlos).
- Los jobs `queued`/`processing` no expiran por este TTL.
- **Nuevo código de error de job**: `error_code: "import_failed"` en
  `ImportJobStatusDto` cuando el import falla por una causa inesperada (distinta de
  `invalid_wld` / `unsupported_version`). El `error_message` acompañante es genérico:
  nunca incluye trazas ni detalles internos.

---

## 3. Reglas transversales

- **CORS**: en dev, `http://localhost:5173`. En prod, mismo nginx que el front.
- **Sesión**: `world_id` opaco (UUID v4). Sin auth. TTL **30 minutos** desde último acceso.
- **Límites**: `TWI_MAX_UPLOAD_MB` (default 200).
- **Versionado**: header `X-API-Version: 0.2` en **toda** respuesta (2xx, 4xx, 5xx, errores de
  validación, límite de upload). El cliente valida este header; si no coincide, muestra advertencia
  de incompatibilidad (no rompe la sesión).
- **Errores HTTP**: `ErrorDto` + header de versión en toda respuesta de error.
- **503**: `code: "catalog_unavailable"` en ambos endpoints `/api/items` cuando catálogo no disponible.

---

## 4. Checklist al cambiar este documento

- [ ] `docs/contracts/openapi.json` regenerado desde `twi.app.create_app().openapi()`.
- [ ] `backend/tests/unit/api_rest/openapi_snapshot.json` regenerado.
- [ ] Tipos frontend regenerados con `openapi-typescript` desde el openapi.json.
- [ ] Sección `Estado` del módulo `api-rest` actualizada con versión de contrato.
- [ ] Sección `Estado` del módulo `api-client` actualizada con versión de contrato.
- [ ] Entrada añadida en changelog de `PROJECT.md`.

> Los artefactos (`docs/contracts/openapi.json`, snapshot unitario, schema generado del
> frontend) viven sincronizados con v0.2 desde iter-11. No editar a mano.

---

## 5. Especificación v0.2 (vigente)

Esta sección promueve a contrato oficial la evolución planificada en el borrador anterior.
La implementación se desarrolla en las iteraciones de la familia B5.1 / F1.1 / F3.1 / F6.1.

### 5.1. `WorldMetadataDto` (v0.2)

Campos añadidos a `WorldMetadataDto` respecto a v0.1:

```json
{
  "name": "string",
  "width": 8400,
  "height": 2400,
  "version": 279,
  "seed": "string",
  "size": "small|medium|large",
  "hardmode": true,
  "spawn_x": 4200,
  "spawn_y": 350,
  "world_surface_y": 320.0,
  "rock_layer_y": 900.0,
  "hell_layer_y": 2100.0
}
```

- `spawn_x`, `spawn_y`: coordenadas de spawn en tiles (int).
- `world_surface_y`, `rock_layer_y`, `hell_layer_y`: capas verticales en unidades tile (float;
  Terraria los almacena como `double` en `.wld`).
- Todos obligatorios en v0.2. El cliente no asume su presencia si `X-API-Version` no es `0.2`.

### 5.2. Encoding `base64-rle-v2`

#### Layout del payload decodificado (antes de base64)

```
[HEADER 8 bytes] [RUNS …] [FRAME_BLOCK …]
```

#### Magic header (8 bytes, siempre presente)

| offset | bytes | campo | tipo | descripción |
|--------|-------|-------|------|-------------|
| 0 | 4 | `magic` | bytes | `0x54 0x57 0x76 0x32` (ASCII "TWv2") |
| 4 | 2 | `frame_count` | uint16LE | número de entradas en FRAME_BLOCK |
| 6 | 2 | `reserved` | uint16LE | `0x0000` |

**Longitud mínima del payload decodificado**: 8 bytes (header sin runs, chunk vacío).

#### Run (10 bytes/run)

Codificación RLE: cada run describe N tiles idénticos consecutivos, recorridos en orden
fila-mayor (y externo, x interno).

| offset | bytes | campo | tipo | descripción |
|--------|-------|-------|------|-------------|
| 0 | 2 | `tile_id` | int16LE | -1 = aire |
| 2 | 2 | `wall_id` | uint16LE | 0 = sin pared |
| 4 | 1 | `liquid_type` | uint8 | 0=none 1=water 2=lava 3=honey 4=shimmer |
| 5 | 1 | `liquid_amount` | uint8 | 0–255 |
| 6 | 1 | `frame_x_hi` | uint8 | byte alto de `frame_x`; 0 si `has_frame=0` |
| 7 | 1 | `flags` | uint8 | ver tabla de bits abajo |
| 8 | 2 | `count` | uint16LE | tiles en este run (1–65535) |

**flags byte:**

| bit | nombre | descripción |
|-----|--------|-------------|
| 0 | `has_frame` | tile tiene entrada en FRAME_BLOCK con frame_x y frame_y completos |
| 1 | `actuator` | tile tiene actuador |
| 2 | `wire_red` | cable rojo presente |
| 3 | `wire_blue` | cable azul presente |
| 4 | `wire_green` | cable verde presente |
| 5 | `wire_yellow` | cable amarillo presente |
| 6–7 | reservado | `0` |

#### Frame packing

`frame_x` (uint16) se reconstruye como:
```
frame_x = (frame_x_hi << 8) | frame_x_lo
```
donde `frame_x_hi` viaja en el run (offset 6) y `frame_x_lo` viaja en FRAME_BLOCK.
`frame_y` (uint16) viaja íntegro en FRAME_BLOCK.

#### FRAME_BLOCK (6 bytes/entrada, al final del payload)

Presente cuando `frame_count > 0`. Entradas ordenadas por `run_index` ascendente.

| offset | bytes | campo | tipo | descripción |
|--------|-------|-------|------|-------------|
| 0 | 2 | `run_index` | uint16LE | índice 0-based del run en el array |
| 2 | 1 | `frame_x_lo` | uint8 | byte bajo de frame_x |
| 3 | 1 | `reserved` | uint8 | `0x00` |
| 4 | 2 | `frame_y` | uint16LE | frame_y completo |

El decoder ignora entradas con `run_index` fuera del rango válido del chunk.

**Endianness**: todo little-endian.

#### Compatibilidad retroactiva `base64-rle-v1`

| Propiedad | v1 | v2 |
|-----------|----|----|
| Discriminador | `encoding = "base64-rle-v1"` | `encoding = "base64-rle-v2"` |
| Magic header | ninguno | 8 bytes `"TWv2"` |
| Bytes/run | 4 (`tile_id` + `count`) | 10 (ver tabla arriba) |
| Paredes | no | sí (`wall_id`) |
| Líquidos | no | sí (`liquid_type` + `liquid_amount`) |
| Frames | no | sí (FRAME_BLOCK) |
| Flags | no | sí |

Endpoints que aceptan ambos encodings:
- `GET /api/worlds/{world_id}/tiles` — discriminador: campo `encoding` en `TilesChunkDto`.
- Sin más endpoints que devuelvan tile bulk en v0.2.

El cliente siempre inspecciona `TilesChunkDto.encoding` antes de decodificar.
La negociación ocurre via query param `?encoding=` (sin valor → servidor devuelve v1).

### 5.3. DTOs nuevos

#### `NpcDto`
```json
{ "id": 17, "name": "Guide", "type": "town", "x": 4200, "y": 348 }
```
- `id`: int — type id de NPC según Terraria.
- `name`: string — nombre personalizado o por defecto del juego.
- `type`: `"town" | "banner"`.
- `x`, `y`: int — coordenadas en tiles.

#### `NpcListDto`
```json
{ "npcs": [ /* NpcDto[] */ ] }
```

#### `TileDetailDto`
```json
{
  "x": 1234, "y": 405,
  "tile_id": 213,
  "wall_id": 2,
  "liquid_type": "none | water | lava | honey | shimmer",
  "liquid_amount": 128,
  "frame_x": 18,
  "frame_y": 0,
  "chest_id": null,
  "sign_id": null,
  "tile_entity_id": 7
}
```
Todos los campos opcionales (`chest_id`, `sign_id`, `tile_entity_id`, `frame_x`, `frame_y`) son
`int | null`.

#### `TileEntityDto` (reservado v0.3 — retirado del contrato en IT-03)
**Retirado del contrato v0.2 y de los exports públicos de B5 (IT-03, 2026-07-16)**: ningún
endpoint lo sirve y mantenerlo exportado era código muerto (hallazgo M01). Las tile
entities siguen referenciadas por `tile_entity_id` (int) en `TileDetailDto`.

Estructura reservada para cuando v0.3 exponga un endpoint que la sirva:
```json
{ "id": 7, "type": "item_frame | weapon_rack | mannequin | hat_rack | plate", "x": 1234, "y": 405 }
```

#### `SearchMatchDto` (v0.2 extendido)
```json
{
  "x": 1250, "y": 402,
  "source": "chest | block | wall | object",
  "chest_id": 12,
  "stack": 1
}
```
- `chest_id`: presente cuando `source="chest"`.
- `stack`: presente cuando `source="chest"`.
- `object` representa objetos/tile frames encontrados por B4; no expone `tile_entity_id` en v0.2.

#### `WorldMetadataDto` (v0.2)
Ver §5.1.

### 5.4. Mapeo de errores extendido (v0.2)

Además de los códigos transversales del encabezado:

| Situación | Status | `code` |
|-----------|--------|--------|
| Coordenadas inválidas o fuera de grid | 400 | `invalid_coordinates` |
| Tile entity no encontrada (futuro) | 404 | `tile_entity_not_found` |
| Catálogo no disponible | 503 | `catalog_unavailable` |
| 404 genérico (ruta inexistente, IT-03) | 404 | `not_found` |

`world_not_found` queda **reservado a los recursos `/worlds/*`** (lo emiten sus handlers
explícitamente). Un 404 sin código de dominio propio (p. ej. una ruta que no existe)
responde `code:"not_found"` desde 2026-07-16 (IT-03; antes respondía incorrectamente
`world_not_found`, hallazgo E10).

### 5.5. Header `X-API-Version: 0.2`

- `XApiVersionMiddleware` (B5) inyecta `X-API-Version: 0.2` en **toda** respuesta.
- El cliente valida el header en cada respuesta recibida.
- Si el valor no coincide con la versión esperada por el cliente, se muestra advertencia de
  incompatibilidad sin interrumpir la sesión.
- La constante de versión en `XApiVersionMiddleware` cambia de `"v0.1.0"` a `"0.2"` en iter-011.

---

## 6. Nota de implementación y artefactos

Los artefactos de contrato están sincronizados con v0.2:

| Artefacto | Estado |
|-----------|--------|
| `docs/contracts/openapi.json` | v0.2 |
| `backend/tests/unit/api_rest/openapi_snapshot.json` | v0.2 |
| `frontend/src/api-client/__generated__/schema.d.ts` | v0.2 |

No editar esos artefactos a mano; regenerarlos desde la app cuando cambie el contrato.
