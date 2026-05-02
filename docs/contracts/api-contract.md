# Contrato de API — TerraScrap

> Fuente de verdad del acuerdo entre frontend y backend. Cualquier cambio aquí afecta a `api-rest` (backend) y `api-client` (frontend) y debe reflejarse en el changelog del `PROJECT.md`.
> La IA debe cargar este documento cuando la iteración toque la frontera cliente–servidor.

Versión: `v0.1.0`
Base path: `/api`
Serialización: `application/json` salvo upload (`multipart/form-data`).
Errores: siempre con forma `{ "error": { "code": string, "message": string, "details"?: any } }`.
Codigos transversales:
- **413**: `code: "upload_too_large"` es el canonico para cualquier limite de upload.
- **422** de validacion FastAPI: `code: "validation_error"`, `details` es la lista de errores normalizada.
- **HTTPException** sin codigo de dominio: `code: "http_error"`.
- **500** no controlado: `code: "internal_error"` sin trazas ni detalles internos.

---

## 1. Recursos

### 1.1. Mundos

#### `POST /api/worlds`
Sube un fichero `.wld` y crea una sesión de mundo.

- **Body** (multipart): `file: <.wld binary>`
- **200**:
  ```json
  {
    "world_id": "uuid",
    "metadata": {
      "name": "string",
      "width": 8400,
      "height": 2400,
      "version": 279,
      "seed": "string",
      "size": "small|medium|large",
      "hardmode": true
    }
  }
  ```
- **400**: archivo no es `.wld` válido (`code: "invalid_wld"`).
- **413**: archivo supera el límite (`code: "upload_too_large"`).
- **422**: versión no soportada (`code: "unsupported_version"`, `details: { version }`).

#### `GET /api/worlds/{world_id}`
Metadatos del mundo cargado.

- **200**: mismo `metadata` que arriba.
- **404**: `code: "world_not_found"`.

#### `DELETE /api/worlds/{world_id}`
Libera memoria de la sesión.

- **204**
- **404**: `code: "world_not_found"`.

#### `GET /api/worlds/{world_id}/tiles`
Devuelve los tiles empaquetados para el renderer.

- **Query**: `chunk_x`, `chunk_y` (**chunk indices**, no coordenadas absolutas de tile), `chunk_size=128` (opcional). Tile coords: `start_x = chunk_x * chunk_size`, `start_y = chunk_y * chunk_size`.
- **200**:
  ```json
  {
    "chunk_x": 0,
    "chunk_y": 0,
    "width": 128,
    "height": 128,
    "encoding": "base64-rle-v1",
    "payload": "…"
  }
  ```
- Encoding canonico vigente: `base64-rle-v1`.
- `payload` es `base64` de runs `(tileId:int16LE, count:uint16LE)`.
- El array plano se recorre en orden fila-mayor (`y` externo, `x` interno).
- Aire se serializa como `tileId = -1`; el maximo `count` de un run es `65535`.

#### `GET /api/worlds/{world_id}/search`
Busca un ítem en el mundo cargado.

- **Query**: `item_id=<int>` (obligatorio), `include_containers=true|false` (default `true`).
- **200**:
  ```json
  {
    "item_id": 757,
    "total": 3,
    "matches": [
      { "x": 1250, "y": 402, "source": "chest", "chest_id": 12, "stack": 1 },
      { "x": 3500, "y": 380, "source": "block" },
      { "x": 3500, "y": 381, "source": "wall" }
    ]
  }
  ```
- **400**: `code: "invalid_item_id"`.
- **404**: `code: "world_not_found"`.

### 1.2. Catálogo de ítems

#### `GET /api/items?q=<texto>&limit=20`
Autocompletado.

- **200**:
  ```json
  {
    "items": [
      { "id": 757, "name": "Zenith", "sprite_url": "https://.../zenith.png", "category": "weapon" }
    ]
  }
  ```

#### `GET /api/items/{item_id}`
Detalle de un ítem.

- **200**:
  ```json
  { "id": 757, "name": "Zenith", "sprite_url": "...", "category": "weapon", "rarity": 10 }
  ```
- **404**: `code: "item_not_found"`.

---

## 2. Reglas transversales

- **CORS**: en dev, permitir `http://localhost:5173`. En prod, servido detrás del mismo nginx que el front.
- **Sesión**: `world_id` es opaco (UUID v4). No hay auth; quien tenga el id puede operar sobre ese mundo cargado. TTL por defecto **30 minutos** desde el último acceso.
- **Límites**: tamaño máximo de upload configurable por env `TWI_MAX_UPLOAD_MB` (default 200).
- **Versionado**: el header `X-API-Version: v0.1.0` se devuelve en toda respuesta.
- **Errores HTTP**: las respuestas generadas por validacion, excepciones HTTP, limite de upload o errores no controlados tambien respetan `ErrorDto` y el header de version.

---

## 3. Checklist al cambiar este documento
- [ ] Actualizar OpenAPI exportado por FastAPI.
- [ ] Regenerar tipos del frontend con `openapi-typescript`.
- [ ] Actualizar `Estado` del módulo `api-rest` y `api-client`.
- [ ] Añadir entrada en el changelog del `PROJECT.md`.

---

## 4. Evolución propuesta TerraMap-like (borrador, no contrato vigente)

Esta sección no modifica `v0.1.0`; planifica la siguiente versión de contrato (`v0.2.0`). Cualquier endpoint o DTO descrito aquí está sujeto al ciclo SDD: actualizar primero el doc y los tests del módulo afectado antes de implementar.

### 4.1. `WorldMetadataDto` extendido

Campos nuevos requeridos para paridad TerraMap (centrar viewport, render por capas, panel propiedades):

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

`spawn_*` son enteros (coordenadas tile). `*_y` son float (Terraria los almacena como `double`).

### 4.2. Tiles enriquecidos: encoding `base64-rle-v2` (8 bytes/tile)

Reemplaza `base64-rle-v1` (4 bytes/run, solo `tile_id`). Cada tile decodificado ocupa **8 bytes** little-endian:

| offset | bytes | campo | tipo |
|--------|-------|-------|------|
| 0 | 2 | `tile_id` (`-1` = aire) | int16 |
| 2 | 2 | `wall_id` (`0` = sin pared) | uint16 |
| 4 | 1 | `liquid_type` (`0..3` = none/water/lava/honey/shimmer) | uint8 |
| 5 | 1 | `liquid_amount` (`0..255`) | uint8 |
| 6 | 1 | `frame_x_packed` (alto byte de frame_x; bajo viaja en flags si aplica) | uint8 |
| 7 | 1 | `flags` (bit0: has_frame, bit1: actuator, bit2: wire_red, bit3..7: reservado) | uint8 |

Variante `frame_x/frame_y` completas (`int16 + int16`) si el tile es frame-important: se serializa como bloque secundario alineado al final del chunk para no inflar tiles vacíos. Spec exacto vivirá en `wld-parser.md` y `world-canvas.md` cuando se implemente.

Compatibilidad: `base64-rle-v1` se mantiene durante `v0.2.0`; `TilesChunkDto.encoding` es discriminador.

### 4.3. Endpoints nuevos

#### `GET /api/worlds/{world_id}/tile?x=<int>&y=<int>`

Detalle de un único tile. Sirve al panel "tile-info" de F6.

- **200**:
  ```json
  {
    "x": 1234,
    "y": 405,
    "tile_id": 213,
    "wall_id": 2,
    "liquid_type": "water",
    "liquid_amount": 128,
    "frame_x": 18,
    "frame_y": 0,
    "chest_id": null,
    "sign_id": null,
    "tile_entity_id": 7
  }
  ```
- **400**: `code:"invalid_coordinates"`.
- **404**: `code:"world_not_found"` o coordenadas fuera del grid.

#### `GET /api/worlds/{world_id}/npcs`

Lista de NPCs town/banner del mundo cargado.

- **200**:
  ```json
  {
    "npcs": [
      { "id": 17, "name": "Guide", "type": "town", "x": 4200, "y": 348 },
      { "id": 18, "name": "Merchant", "type": "town", "x": 4205, "y": 348 }
    ]
  }
  ```
- **404**: `code:"world_not_found"`.

### 4.4. Búsqueda con `frame_x/frame_y`

`GET /api/worlds/{world_id}/search` admite parámetros opcionales para distinguir variantes de tile que comparten `tile_id`:

- **Query**: `item_id=<int>` (obligatorio), `include_containers=true|false` (default `true`), `frame_x=<int>` (opcional), `frame_y=<int>` (opcional).
- Si se proveen `frame_x/frame_y`, los matches `source="block"` solo incluyen tiles cuyo `(frame_x, frame_y)` coincida exactamente.
- `SearchMatchDto.source` admite `"object"` (tile entity con inventario: item frame, weapon rack, mannequin, hat rack). Cuando `include_containers=false`, se omiten tanto `chest` como `object`.

`SearchMatchDto` extendido:

```json
{ "x": 1250, "y": 402, "source": "object", "tile_entity_id": 7, "stack": 1 }
```

Estado: planificado, no implementado.
