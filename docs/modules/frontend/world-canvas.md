# Módulo `F3 – world-canvas`

## 1. Propósito
Renderizar el mundo de Terraria sobre un `<canvas>` HTML 2D, con pan y zoom. Consume los chunks de tiles del backend, los decodifica y pinta. Expone una API imperativa para centrar coordenadas y dibujar overlays.

## 2. Contrato público

```ts
// src/world-canvas/index.ts
export interface WorldCanvasHandle {
  centerOn(x: number, y: number): void;
  setZoom(level: number): void;        // 1 = 1 tile por píxel base; clampa a [min, max]
  zoomToFit(): number | null;          // ajusta el mundo entero; PUEDE devolver un zoom
                                       // < ZOOM_LIMITS.min si el mundo no cabe (IT-07, E15)
  redraw(): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { px: number; py: number };
  exportToPng(): Promise<Blob>;
}

// Fuente única de las constantes de zoom (IT-07, D04). app-shell debe
// consumirlas de aquí en vez de duplicarlas.
export const ZOOM_LIMITS: { min: 0.25; max: 8; initial: 2; step: 0.5 };

export interface WorldCanvasProps {
  worldId: string;
  metadata: WorldMetadata;
  apiClient: ApiClient;
  onReady?: (handle: WorldCanvasHandle) => void;
  onTileClick?: (tile: { x: number; y: number }) => void;
  onTileSelected?: (tile: { x: number; y: number }) => void;
  onZoomChange?: (zoom: number) => void; // IT-07 (E05): rueda, setZoom y zoomToFit
  onError?: (err: Error) => void;
  showLayerLines?: boolean;
  showSpawnPoint?: boolean;
  showWalls?: boolean;
  showLiquids?: boolean;
  showWires?: boolean;
}

export const WorldCanvas: React.FC<WorldCanvasProps>;
```

## 3. Dependencias
- `F1 api-client`.
- React 19.
- No usar WebGL en v1 (Canvas 2D es suficiente con chunking).

## 4. No objetivos
- No implementa el resaltado de búsqueda (eso es `highlight-overlay`).
- No sabe qué es un "ítem".
- No gestiona el estado del mundo cargado fuera de su prop.

## 5. Especificación (SDD)
- **SP-01** Al montar con un `worldId`, solicita los chunks visibles inicialmente y los pinta.
- **SP-02** Drag con botón izquierdo = pan.
- **SP-03** Rueda = zoom centrado en el cursor.
- **SP-04** Pinch en táctil = zoom.
- **SP-05** Zoom acotado (`minZoom`, `maxZoom`). En el min se ve el mundo entero; en el max, píxeles gordos.
- **SP-06** Los chunks se piden **perezosamente** según el viewport y se cachean en memoria.
- **SP-07** `centerOn(x,y)` anima (o no, en v1) el viewport hasta centrar ese tile.
- **SP-08** `onTileClick` se dispara con la coordenada del tile pulsado.
- **SP-09** Es resiliente a redimensionado del contenedor (ResizeObserver).
- **SP-10** El render usa `requestAnimationFrame`.
- **SP-11** Los chunks parciales de los bordes derecho e inferior se recortan contra los limites reales del mundo. Para `(cx, cy)`, `chunkSize`, `worldW` y `worldH`: `w = min(chunkSize, worldW - cx * chunkSize)` y `h = min(chunkSize, worldH - cy * chunkSize)`. El helper interno `computeChunkDimensions` centraliza este calculo y se usa tanto al crear el bitmap como al escalar `drawImage`.
- **SP-12** (IT-07) Todo cambio de zoom interno (rueda, `setZoom`, `zoomToFit`) notifica al host vía `onZoomChange(zoom)` para que el estado externo no se desincronice.
- **SP-13** (IT-07) Un click precedido de un drag con desplazamiento acumulado > 5 px NO dispara `onTileClick`/`onTileSelected` (terminar un pan no selecciona tile).
- **SP-14** (IT-07) `zoomToFit` no clampa por debajo de `ZOOM_LIMITS.min`: en mundos grandes devuelve `min(viewportW/worldW, viewportH/worldH)` aunque sea < min (solo clampa al máximo).
- **SP-15** (IT-08, E08) Cambiar de mundo dispara **exactamente un fetch por chunk visible**: un único camino de recarga limpia cachés del mundo anterior y relanza; no hay efectos solapados que vacíen `pendingRef` con fetches en vuelo.
- **SP-16** (IT-08, E09) Togglear capas (paredes/líquidos/cables) re-rasteriza los chunks desde la caché de `DecodedChunkV2` ya descargados; **no** vuelve a la red.
- **SP-17** (IT-08, P03) El tamaño de chunk pedido al backend es adaptativo según zoom vía `chunkSizeForZoom(zoom)`: `zoom ≥ 1 → 128`, `0.5 < zoom < 1 → 256`, `zoom ≤ 0.5 → 512` (el backend admite hasta 512). Las cachés se indexan por `(worldId, chunkSize, cx, cy)`.
- **SP-18** (IT-08, P07) Las cachés de bitmaps y de chunks decodificados están acotadas con política LRU (al superar el tope se desaloja la entrada menos recientemente usada).
- **SP-19** (IT-08, M09) Render unificado: todo chunk se rasteriza con `renderChunkBitmapV2`. Un payload `base64-rle-v1` se decodifica a un `DecodedChunkV2` parcial (solo `tileId`) vía `decodeBase64RleV1AsV2`; el renderer v1 (`renderChunkBitmap`/`paintBackdrop`) queda eliminado. La compat v1 vive solo en el decoder (DEC-2).

## 6. Plan de tests (TDD)
Combinación de tests de componente + tests de funciones puras (más barato).

Funciones puras extraídas (unitarias):
- [x] `T-01 screenToWorld maps correctly at zoom=1 and no pan`
- [x] `T-02 screenToWorld is inverse of worldToScreen`
- [x] `T-03 zoom around cursor preserves the world coordinate under the cursor`
- [x] `T-04 clampZoom respects min/max`
- [x] `T-05 visibleChunks returns only chunks intersecting viewport`
- [x] `T-D1 computeChunkDimensions should return full dimensions for an interior chunk`
- [x] `T-D2 computeChunkDimensions should clip width for a right-edge chunk`
- [x] `T-D3 computeChunkDimensions should clip height for a bottom-edge chunk`
- [x] `T-D4 computeChunkDimensions should clip both dimensions for a bottom-right chunk`

De componente:
- [x] `T-06 renders canvas element with correct dimensions`
- [x] `T-07 calls apiClient.getTilesChunk for initial viewport`
- [x] `T-08 panning updates state and triggers redraw`
- [x] `T-09 onTileClick receives correct tile coordinates`
- [x] `T-10 onReady emits a handle with imperative API`
- [x] `T-12 WorldCanvas should call ctx.drawImage when rendering a loaded chunk`
- [x] `T-13 WorldCanvas should draw clipped dimensions for edge chunks in a non-multiple world`

Caché de bitmaps (unitarias — desde IT-08 los tests de dimensiones apuntan al
renderer unificado `renderChunkBitmapV2` y la caché se indexa también por
`chunkSize`):
- [x] `T-C1 renderChunkBitmapV2 should return HTMLCanvasElement sized chunkSize×chunkSize` (+ `chunkSize` en `RenderedChunk`)
- [x] `T-C5 createChunkBitmapCache should return undefined for missing key`
- [x] `T-C6 createChunkBitmapCache should retrieve a stored RenderedChunk by worldId, chunkSize, cx, cy`
- [x] `T-C7 createChunkBitmapCache clearWorld should remove only chunks for that worldId`
- [x] `T-C8 createChunkBitmapCache size should reflect cache count after set and clearWorld`
- [x] `T-C9 renderChunkBitmapV2 should size right-edge chunk bitmap to clipped world width`
- [x] `T-C10 renderChunkBitmapV2 should size bottom-edge chunk bitmap to clipped world height`
- [x] `T-C11 renderChunkBitmapV2 should size bottom-right chunk bitmap to both clipped dimensions`
- [x] `T-C12 renderChunkBitmapV2 should keep full chunk dimensions when world dimensions are multiples of chunkSize`
- [x] `T-C13 renderChunkBitmapV2 should use clipped width as row stride for partial chunks`
- [x] `T-C14 should evict the least recently used chunk when the cap is exceeded (P07)`
- [x] `T-C15 get should refresh recency so a recently drawn chunk survives eviction`
- (T-C2/C3/C4 eliminados con el renderer v1: su comportamiento lo cubren los `T-VL-*` del renderer v2)

LRU genérica (`lruCache.ts`, IT-08):
- [x] `should evict the least recently used entry when the cap is exceeded`
- [x] `should refresh recency on get so a recently read entry survives eviction`
- [x] `should refresh recency on set of an existing key without growing`
- [x] `clearPrefix should remove only entries whose key starts with the prefix`

Decoder v2 (iter-16):
- [x] `T-V2-1 decodes tile_id, wall_id, liquid_type, liquid_amount from single run`
- [x] `T-V2-2 reconstructs frame_x and frame_y from frame block`
- [x] `T-V2-3 air tiles default to tileId=-1`
- [x] `T-V2-4 empty payload returns all-air chunk`
- [x] `T-V2-5 invalid magic returns all-air chunk`
- [x] `T-V2-6 flags byte preserved per tile`
- [x] `T-V2-7 multiple runs fill correct indices in row-major order`
- [x] `T-V2-8 run with no frame entry leaves frameX/Y=0 when has_frame set`
- [x] `T-V1-COMPAT v1 decoder output unchanged`
- [x] `decodeBase64RleV1AsV2 should produce a DecodedChunkV2 whose tileId matches the v1 decoder output` (IT-08)
- [x] `decodeBase64RleV1AsV2 should leave walls, liquids, frames and flags zeroed` (IT-08)

Render por capas v2 (iter-16):
- [x] `T-VL-1 draws wall color for wall_id > 0`
- [x] `T-VL-2 draws tile color for tile_id >= 0`
- [x] `T-VL-3 draws liquid color for liquid_type > 0 and amount > 0`
- [x] `T-VL-4 layer order: wall before tile before liquid`
- [x] `T-VL-5 tile with wall+tile renders 2 fillRect calls`
- [x] `T-VL-6 air tile with liquid_amount=0 renders 0 fillRect calls`

Nuevos tests de componente (iter-16):
- [x] `T-14 WorldCanvas re-fetches chunks when worldId changes`
- [x] `T-15 setZoom clamps to minimum 0.25`
- [x] `T-15b setZoom clamps to maximum 8`
- [x] `T-16 exportToPng returns a non-empty Blob`
- [x] `T-17 onTileSelected receives correct tile coordinates on click`

Interacción/zoom (IT-07):
- [x] `T-19 wheel zoom notifies onZoomChange with the new zoom`
- [x] `T-19b setZoom and zoomToFit notify onZoomChange`
- [x] `T-20 click after a >5px drag does not select a tile`
- [x] `T-20b click without movement still selects a tile`
- [x] `T-21 zoomToFit returns min(w/W, h/H) without lower clamp on large worlds`
- [x] `T-22 ZOOM_LIMITS exported from index with min/max/initial/step`
- [x] `T-15c` adaptado: `zoomToFit` en mundo 4200×1200 devuelve ~0.19 (ya sin clamp a 0.25)

Pipeline de datos (IT-08):
- [x] `T-23 world change triggers exactly one fetch per visible chunk (E08)`
- [x] `T-24 layer toggle re-renders without network (E09)`
- [x] `T-25 chunkSizeForZoom picks the chunk size for the current zoom` (≥1→128, <1→256, ≤0.5→512)

## 7. Notas de implementación
- Chunk size **adaptativo** (IT-08, P03): `chunkSizeForZoom(zoom)` en `viewport.ts` decide el tamaño pedido al backend (128/256/512). En los bordes derecho e inferior, el bitmap usa el tamano real devuelto por `computeChunkDimensions`; no se anade padding. Cada chunk se pinta a un `HTMLCanvasElement` cacheado; al redibujar, se copia a `ctx.drawImage()` con dimensiones escaladas por zoom.
- Paleta: `tileColors.ts` expone `getTileColor`, `getWallColor`, `getLiquidColor`. Sprites detallados pospuestos.
- `base64-rle-v1`: runs `(tileId: int16, count: uint16)`, decodifica a `Int16Array` (`decodeBase64RleV1`, se mantiene por DEC-2). `decodeBase64RleV1AsV2` lo adapta a un `DecodedChunkV2` parcial (solo `tileId`) para el renderer unificado.
- `base64-rle-v2`: header "TWv2" (8 bytes) + runs (10 bytes cada uno) + FRAME_BLOCK (6 bytes/entrada). Implementado en `decodeBase64RleV2` → `DecodedChunkV2`.
- Render **unificado** (IT-08, M09): todo chunk pasa por `renderChunkBitmapV2` (backdrop → wall → tile → liquid → wire, una pasada de ImageData). El renderer v1 (`renderChunkBitmap`/`paintBackdrop`) fue eliminado.
- Cachés acotadas (IT-08, P07): `lruCache.ts` expone `createLruCache` (Map con orden de inserción; get/set refrescan recencia). La caché de bitmaps (`createChunkBitmapCache`, tope 256) y la de chunks decodificados (`DecodedChunkEntry = { data, surfaceY }`, tope 128, en `WorldCanvas`) se indexan por `worldId:chunkSize:cx:cy`.
- Zoom rango `[0.25, 8]`. Centrado en cursor via `zoomAroundCursor`.
- Viewport inicial centrado en `spawn_x/spawn_y` de `WorldMetadataDto` (la carga inicial la dispara el ResizeObserver al dimensionar el canvas).
- worldId change (IT-08, E08): un único efecto purga bitmaps + decodificados + `pendingRef` del mundo anterior y recarga — exactamente un fetch por chunk visible. Toggle de capas (E09): re-rasteriza desde la caché decodificada, sin red. `worldId`/`metadata` se capturan al lanzar cada fetch para no archivar respuestas tardías bajo el mundo nuevo.
- `exportToPng()`: `canvas.toBlob('image/png')` devuelve `Promise<Blob>`.
- Tipos migrados de `types.ts` local a `../api-client` (F1). `types.ts` eliminado.
- El estado de pan/zoom vive en `useRef` para no provocar re-renders; el dibujo se dispara imperativamente.

## 8. Performance
- Target: 60 fps al panear, mundos large.
- Al hacer zoom-out extremo, usar chunks "mipmap" (reducidos) cacheados.

## 9. Errores
- Fallos de API delegados por `onError` del host (v1.1 opcional).

## 10. Estado
- **Versión del contrato**: v2.1 (IT-07: `onZoomChange`, `ZOOM_LIMITS`, `zoomToFit` sin clamp inferior; IT-08 no cambia el contrato público)
- **Último cierre**: 2026-07-17 — IT-08 (PLAN_REMEDIACION E08+E09+P03+P07+M09): pipeline de datos
- **Iteración actual**: cerrada

### 10.-1. Cambios IT-08 (pipeline de datos, sin cambio de contrato)

- E08 — eliminado el efecto solapado que vaciaba `pendingRef` con fetches en
  vuelo: cambiar de mundo dispara exactamente un fetch por chunk visible
  (SP-15, test T-23).
- E09 — nueva caché LRU de `DecodedChunkV2` (+`surface_y` por columna): togglear
  paredes/líquidos/cables re-rasteriza en local sin volver a la red (SP-16,
  test T-24).
- P03 — `chunkSizeForZoom(zoom)`: 128 (zoom ≥ 1), 256 (0.5 < zoom < 1), 512
  (zoom ≤ 0.5). Un zoom-to-fit de mundo large pasa de ~1 254 requests a ~85
  (SP-17, test T-25). Cachés y `pendingRef` indexadas por
  `worldId:chunkSize:cx:cy`.
- P07 — cachés acotadas con LRU (`lruCache.ts`): bitmaps tope 256, decodificados
  tope 128 (SP-18, tests T-C14/T-C15 y suite `lruCache`).
- M09 — renderer v1 (`renderChunkBitmap` + `paintBackdrop`) eliminado; los
  payloads v1 se adaptan con `decodeBase64RleV1AsV2` y todo se rasteriza con
  `renderChunkBitmapV2` (SP-19). `decodeBase64RleV1` se conserva (DEC-2).
- `RenderedChunk` incorpora `chunkSize`; `ChunkBitmapCache.get` pasa a
  `(worldId, chunkSize, cx, cy)` (módulo interno, no exportado en `index.ts`).

### 10.0. Cambios v2.1 (IT-07) 🔶

- E05 — nueva prop `onZoomChange?: (zoom: number) => void`, disparada en los
  tres caminos que cambian el zoom internamente (rueda, `setZoom`, `zoomToFit`)
  para que el host (app-shell) no se desincronice.
- E07 — supresión de click tras drag: acumulador de distancia en
  `mousedown/mousemove`; si supera 5 px (`CLICK_DRAG_THRESHOLD_PX`), el click
  que cierra el pan no dispara `onTileClick`/`onTileSelected`.
- E15 — `zoomToFit` ya no clampa a `ZOOM_LIMITS.min`: devuelve
  `min(viewportW/worldW, viewportH/worldH)` (solo clampa al máximo), de modo
  que un mundo large (8400×2400) cabe entero en un canvas 800×600
  (zoom ≈ 0.095). `setZoom` y la rueda siguen clampando a `[min, max]`.
- D04 (parte F3) — constantes de zoom unificadas en `ZOOM_LIMITS =
  { min: 0.25, max: 8, initial: 2, step: 0.5 }`, definidas en `viewport.ts` y
  exportadas desde `world-canvas/index.ts`. La eliminación de las copias de
  app-shell (`appState.ts`, HUD de `App.tsx`) es IT-09.
- Consumidor pendiente: app-shell debe conectar `onZoomChange → SET_ZOOM` y
  reutilizar `ZOOM_LIMITS` (IT-09; anotado también en PLAN_REMEDIACION).

### 10.1. Cambios IT-06 (paleta, sin cambio de contrato)

- D01 — `TILE_COLORS`/`WALL_COLORS` (`tileColors.ts`) reducidas de 346/188 entradas
  a 24/13 overrides reales: se eliminaron las 316 (tiles) + 175 (paredes) entradas
  byte a byte idénticas a `FALLBACK_TILE_COLORS`/`FALLBACK_WALL_COLORS`, que es la
  paleta base derivada de TerraMap. Un test nuevo prohíbe reintroducir duplicados
  idénticos y otro valida que TODOS los literales de ambos ficheros sean `#rrggbb`.
- E04 — eliminados los overrides con typo de transcripción; gana el valor del
  fallback (TerraMap): 125 (`#8daff` inválido → `#8dafff`), 245/246
  (`#633220` → `#63321e`), 637/638 (`#c87850` → `#c8784b`).
- M12 — eliminada la entrada centinela `10000: DRESSER_COLOR` y la constante
  `DRESSER_COLOR` (sin uso).
- Las tablas se exportan ahora desde `tileColors.ts` (solo para tests/inspección;
  el contrato público del módulo en `index.ts` no cambia).
- Tests nuevos: `tileColors should only contain overrides that differ from the
  fallback` (×2, tiles y paredes), `all palette entries should be valid #rrggbb`,
  `getTileColor(125) should return #8dafff`, `should not contain the unused
  sentinel entry 10000`.

## 11. Decisiones tomadas en iter-007

- **Tipos compartidos**: `WorldMetadata`, `TilesChunk`, `ApiClient` se reexportan desde `src/api-client/index.ts`.
- **Prop refs via useEffect**: La regla `react-hooks/refs` (v7) prohíbe escribir `ref.current` durante render. Se usa `useEffect` sin deps para sincronizar las props-mirrors después de cada render. Seguro porque los callbacks que leen esos refs siempre se ejecutan tras render (RAF, event handlers, effects).
- **Paleta de colores plana**: v1 usa `tileId → hex` estático en `tileColors.ts`. Sprites detallados pospuestos a v2.
- **Compatibilidad vitest@3 / vite@8**: `@vitejs/plugin-react@6` requiere vite@8 pero vitest@3 usa vite@7 internamente. Solución: esbuild config con `jsx: 'automatic'` en `vitest.config.ts` en lugar del plugin Babel.
- **Canvas en jsdom**: jsdom no implementa canvas rendering. Se añade mock de `getContext('2d')` en `setupTests.ts` con `clearRect`, `fillRect` y `drawImage` spy-ables. También se añade `cleanup()` explícito porque RTL no lo llama automáticamente sin globals de Vitest.

## 14. Decisiones tomadas en iter-017 (chunk bitmap cache)

- **`chunkBitmapCache.ts`**: Módulo interno (no exportado desde `index.ts`). Expone `RenderedChunk`, `ChunkBitmapCache` (interfaz), `createChunkBitmapCache()` y `renderChunkBitmap()`.
- **Pre-render al recibir tiles**: En `loadChunk`, justo después de `decodeBase64RleV1`, se llama `renderChunkBitmap(...)` que crea un `HTMLCanvasElement` de 128×128 px (1 px/tile) y pinta cada tile con `fillRect(tx, ty, 1, 1)`. Los tiles negativos (aire) se omiten.
- **`drawImage` en el RAF**: El loop de render reemplaza el `for-loop fillRect` por `ctx.drawImage(rendered.canvas, pixelX, pixelY, pixelSize, pixelSize)`. `ctx.imageSmoothingEnabled = false` asegura nearest-neighbor al escalar.
- **HTMLCanvasElement vs OffscreenCanvas**: Se usa `HTMLCanvasElement` (compatible con jsdom). `OffscreenCanvas` queda como optimización futura (requiere estrategia de mock diferente en tests o feature-detection en runtime).
- **`chunkCacheRef` eliminado (2026-05-19)**: `bitmapCacheRef` y `pendingRef` deduplican fetches y evitan conservar `Int16Array` raw fuera del pre-render.

## 13. Decisiones tomadas (bugfix viewport-inicial 2026-04-27)

- Viewport arrancaba en `panX:0, panY:0` (top-left = cielo puro). Invisible porque el renderer omite `tileId < 0` (aire).
- Fix inicial: `viewInitializedRef` flag; en el primer disparo de ResizeObserver se calculaba pan para centrar cerca de superficie.
- Comportamiento vigente: el viewport inicial se centra en `spawn_x`/`spawn_y` de `WorldMetadata`.
- Añadidos tests T-07 (actualizado), T-09 (actualizado), T-11 (nuevo).

## 12. Deuda / follow-ups

- **OffscreenCanvas**: `renderChunkBitmapV2` usa `HTMLCanvasElement`. Migrar a `OffscreenCanvas` para eliminar overhead de DOM en el hilo principal. Requiere feature-detection (`typeof OffscreenCanvas !== 'undefined'`) y actualización del mock en tests.
- **Eliminar `chunkCacheRef`**: cerrado 2026-05-19; la deduplicación usa `bitmapCacheRef` + `pendingRef`.
- **Mipmap zoom-out**: SP-08 del doc menciona chunks "mipmap" reducidos para zoom extremo. No implementado en v1.
- **Pinch-to-zoom táctil**: SP-04. No implementado en v1; requires TouchEvent handling.
- **Animación en centerOn**: SP-07 menciona animación opcional. v1 hace jump instantáneo.

### Evolución propuesta para paridad con TerraMap

Referencia local acotada:
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\main.js`
  - leer solo `getTileColor`, `resizeCanvases`, `getMousePos`, `drawSelectionIndicator`, `saveMapImage`.
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\MapHelper.js`
  - leer solo tablas `tileColors`, `wallColors`, `liquidColors` y la lógica de capas de cielo/tierra/roca/infierno.

Brechas actuales:
- `tileColors.ts` ampliada con tiles/walls/liquids principales de TerraMap (deuda-2026-05-31).
  Sigue siendo incompleta frente a TerraMap (cientos de IDs); ampliación incremental futura.
- zoom-to-fit ya existe en `WorldCanvasHandle`; export PNG con overlay se compone desde F6.

Cambios candidatos:

**Render por capas**:
- seguir ampliando `tileColors`, `wallColors`, `liquidColors` cuando aparezcan IDs visibles
  no mapeados sobre mundos reales.

**Zoom-to-fit**:
- Implementado 2026-05-19: `WorldCanvasHandle.zoomToFit(): number | null` calcula `zoom = min(viewportW / worldW, viewportH / worldH)` clamped a `[minZoom, maxZoom]`, centra `(worldW/2, worldH/2)` y devuelve el zoom aplicado para sincronizar F6.
- `WorldCanvasHandle.getViewport(): { x, y, width, height, zoom }` para que F6 pueda persistir o exportar.

**Export PNG con overlay**:
- F6 compone los canvas del contenedor para incluir overlay; `WorldCanvasHandle.exportToPng()` sigue exportando el canvas base.

Tests mínimos futuros:
- `zoomToFit` deja el mundo entero dentro del viewport (≤1 tile de margen).
- export con overlay incluye matches visibles cuando F5/F6 provean el canvas adicional.
