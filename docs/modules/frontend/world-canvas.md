# Módulo `F3 – world-canvas`

## 1. Propósito
Renderizar el mundo de Terraria sobre un `<canvas>` HTML 2D, con pan y zoom. Consume los chunks de tiles del backend, los decodifica y pinta. Expone una API imperativa para centrar coordenadas y dibujar overlays.

## 2. Contrato público

```ts
// src/world-canvas/index.ts
export interface WorldCanvasHandle {
  centerOn(x: number, y: number): void;
  setZoom(level: number): void;        // 1 = 1 tile por píxel base
  redraw(): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { px: number; py: number };
}

export interface WorldCanvasProps {
  worldId: string;
  metadata: WorldMetadata;
  apiClient: ApiClient;
  onReady?: (handle: WorldCanvasHandle) => void;
  onTileClick?: (tile: { x: number; y: number }) => void;
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

Caché de bitmaps (unitarias):
- [x] `T-C1 renderChunkBitmap should return HTMLCanvasElement sized chunkSize×chunkSize`
- [x] `T-C2 renderChunkBitmap should call fillRect for non-air tiles`
- [x] `T-C3 renderChunkBitmap should not call fillRect for air tiles (tileId < 0)`
- [x] `T-C4 renderChunkBitmap should use correct pixel coordinates (tx, ty, 1, 1)`
- [x] `T-C5 createChunkBitmapCache should return undefined for missing key`
- [x] `T-C6 createChunkBitmapCache should retrieve a stored RenderedChunk by worldId, cx, cy`
- [x] `T-C7 createChunkBitmapCache clearWorld should remove only chunks for that worldId`
- [x] `T-C8 createChunkBitmapCache size should reflect cache count after set and clearWorld`
- [x] `T-C9 renderChunkBitmap should size right-edge chunk bitmap to clipped world width`
- [x] `T-C10 renderChunkBitmap should size bottom-edge chunk bitmap to clipped world height`
- [x] `T-C11 renderChunkBitmap should size bottom-right chunk bitmap to both clipped dimensions`
- [x] `T-C12 renderChunkBitmap should keep full chunk dimensions when world dimensions are multiples of chunkSize`
- [x] `T-C13 renderChunkBitmap should use clipped width as row stride for partial chunks`

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

## 7. Notas de implementación
- Chunk size nominal: 128x128 tiles. En los bordes derecho e inferior, el bitmap usa el tamano real devuelto por `computeChunkDimensions`; no se anade padding hasta 128x128. Cada chunk se pinta a un `HTMLCanvasElement` cacheado; al redibujar, se copia a `ctx.drawImage()` con dimensiones escaladas por zoom.
- Paleta: `tileColors.ts` expone `getTileColor`, `getWallColor`, `getLiquidColor`. Sprites detallados pospuestos.
- `base64-rle-v1`: runs `(tileId: int16, count: uint16)`, decodifica a `Int16Array`.
- `base64-rle-v2`: header "TWv2" (8 bytes) + runs (10 bytes cada uno) + FRAME_BLOCK (6 bytes/entrada). Implementado en `decodeBase64RleV2` → `DecodedChunkV2`.
- Render v2 en 3 pasadas: walls → tiles → liquids (función `renderChunkBitmapV2`).
- Zoom rango `[0.25, 8]`. Centrado en cursor via `zoomAroundCursor`.
- Viewport inicial centrado en `spawn_x/spawn_y` de `WorldMetadataDto`.
- worldId change: limpia `bitmapCacheRef`, `pendingRef` y recarga chunks.
- `exportToPng()`: `canvas.toBlob('image/png')` devuelve `Promise<Blob>`.
- Tipos migrados de `types.ts` local a `../api-client` (F1). `types.ts` eliminado.
- El estado de pan/zoom vive en `useRef` para no provocar re-renders; el dibujo se dispara imperativamente.

## 8. Performance
- Target: 60 fps al panear, mundos large.
- Al hacer zoom-out extremo, usar chunks "mipmap" (reducidos) cacheados.

## 9. Errores
- Fallos de API delegados por `onError` del host (v1.1 opcional).

## 10. Estado
- **Versión del contrato**: v2 (breaking: nuevas props, handle extendido, tipos migrados a F1)
- **Último cierre**: 2026-05-11 — iter-16 cerrada: decoder v2, capas, spawn, zoom [0.25,8], exportToPng, onTileSelected, worldId change, refactor tipos
- **Iteración actual**: cerrada

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

- **OffscreenCanvas**: `renderChunkBitmap` usa `HTMLCanvasElement`. Migrar a `OffscreenCanvas` para eliminar overhead de DOM en el hilo principal. Requiere feature-detection (`typeof OffscreenCanvas !== 'undefined'`) y actualización del mock en tests.
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
- `tileColors.ts` es una paleta mínima; TerraMap cubre cientos de tiles, walls y líquidos.
- zoom-to-fit ya existe en `WorldCanvasHandle`; export PNG con overlay se compone desde F6.

Cambios candidatos:

**Render por capas**:
- ampliar paletas de `tileColors`, `wallColors`, `liquidColors` y `layerColors` para acercarse a TerraMap.

**Zoom-to-fit**:
- Implementado 2026-05-19: `WorldCanvasHandle.zoomToFit(): number | null` calcula `zoom = min(viewportW / worldW, viewportH / worldH)` clamped a `[minZoom, maxZoom]`, centra `(worldW/2, worldH/2)` y devuelve el zoom aplicado para sincronizar F6.
- `WorldCanvasHandle.getViewport(): { x, y, width, height, zoom }` para que F6 pueda persistir o exportar.

**Export PNG con overlay**:
- F6 compone los canvas del contenedor para incluir overlay; `WorldCanvasHandle.exportToPng()` sigue exportando el canvas base.

Tests mínimos futuros:
- `zoomToFit` deja el mundo entero dentro del viewport (≤1 tile de margen).
- export con overlay incluye matches visibles cuando F5/F6 provean el canvas adicional.
