# Contrato de API — TerraScrap

> Fuente de verdad del acuerdo entre frontend y backend. Cualquier cambio aquí afecta a `api-rest` (backend) y `api-client` (frontend) y debe reflejarse en el changelog del `PROJECT.md`.
> La IA debe cargar este documento cuando la iteración toque la frontera cliente–servidor.

Versión: `v0.1.0`
Base path: `/api`
Serialización: `application/json` salvo upload (`multipart/form-data`).
Errores: siempre con forma `{ "error": { "code": string, "message": string, "details"?: any } }`.

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
- **413**: archivo supera el límite (`code: "file_too_large"`).
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
- Nota: la codificación `base64-rle-v1` está especificada en `wld-parser` / `world-canvas`.

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

---

## 3. Checklist al cambiar este documento
- [ ] Actualizar OpenAPI exportado por FastAPI.
- [ ] Regenerar tipos del frontend con `openapi-typescript`.
- [ ] Actualizar `Estado` del módulo `api-rest` y `api-client`.
- [ ] Añadir entrada en el changelog del `PROJECT.md`.