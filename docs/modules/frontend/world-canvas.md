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
- React 18.
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

## 6. Plan de tests (TDD)
Combinación de tests de componente + tests de funciones puras (más barato).

Funciones puras extraídas (unitarias):
- [x] `T-01 screenToWorld maps correctly at zoom=1 and no pan`
- [x] `T-02 screenToWorld is inverse of worldToScreen`
- [x] `T-03 zoom around cursor preserves the world coordinate under the cursor`
- [x] `T-04 clampZoom respects min/max`
- [x] `T-05 visibleChunks returns only chunks intersecting viewport`

De componente:
- [x] `T-06 renders canvas element with correct dimensions`
- [x] `T-07 calls apiClient.getTilesChunk for initial viewport`
- [x] `T-08 panning updates state and triggers redraw`
- [x] `T-09 onTileClick receives correct tile coordinates`
- [x] `T-10 onReady emits a handle with imperative API`
- [x] `T-12 WorldCanvas should call ctx.drawImage when rendering a loaded chunk`

Caché de bitmaps (unitarias):
- [x] `T-C1 renderChunkBitmap should return HTMLCanvasElement sized chunkSize×chunkSize`
- [x] `T-C2 renderChunkBitmap should call fillRect for non-air tiles`
- [x] `T-C3 renderChunkBitmap should not call fillRect for air tiles (tileId < 0)`
- [x] `T-C4 renderChunkBitmap should use correct pixel coordinates (tx, ty, 1, 1)`
- [x] `T-C5 createChunkBitmapCache should return undefined for missing key`
- [x] `T-C6 createChunkBitmapCache should retrieve a stored RenderedChunk by worldId, cx, cy`
- [x] `T-C7 createChunkBitmapCache clearWorld should remove only chunks for that worldId`
- [x] `T-C8 createChunkBitmapCache size should reflect cache count after set and clearWorld`

## 7. Notas de implementación
- Chunk size: 128×128 tiles. Cada chunk se pinta a un `OffscreenCanvas` cacheado; al redibujar, se copia a `ctx.drawImage()` (muy rápido).
- Paleta de bloques: mapping `tileId -> color` embebido en el módulo (JSON estático). Los sprites detallados se posponen a v2; v1 usa colores planos.
- `base64-rle-v1`: runs `(tileId: int16, count: uint16)`. Decodificar en un `Uint16Array`.
- El estado de pan/zoom vive en `useRef` para no provocar re-renders; el dibujo se dispara imperativamente.

## 8. Performance
- Target: 60 fps al panear, mundos large.
- Al hacer zoom-out extremo, usar chunks "mipmap" (reducidos) cacheados.

## 9. Errores
- Fallos de API delegados por `onError` del host (v1.1 opcional).

## 10. Estado
- **Versión del contrato**: v1 (sin cambio — optimización interna)
- **Último cierre**: 2026-04-28 — reabierto y cerrado (chunk bitmap cache — iter-017)
- **Iteración actual**: cerrada

## 11. Decisiones tomadas en iter-007

- **Tipos provisionales**: `WorldMetadata`, `TilesChunk`, `ApiClient` se definen localmente en `types.ts` (espejo estructural del contrato público de F1). Cuando F1 ship, reemplazar re-exportando desde `src/api-client/index.ts`.
- **Prop refs via useEffect**: La regla `react-hooks/refs` (v7) prohíbe escribir `ref.current` durante render. Se usa `useEffect` sin deps para sincronizar las props-mirrors después de cada render. Seguro porque los callbacks que leen esos refs siempre se ejecutan tras render (RAF, event handlers, effects).
- **Paleta de colores plana**: v1 usa `tileId → hex` estático en `tileColors.ts`. Sprites detallados pospuestos a v2.
- **Compatibilidad vitest@3 / vite@8**: `@vitejs/plugin-react@6` requiere vite@8 pero vitest@3 usa vite@7 internamente. Solución: esbuild config con `jsx: 'automatic'` en `vitest.config.ts` en lugar del plugin Babel.
- **Canvas en jsdom**: jsdom no implementa canvas rendering. Se añade mock de `getContext('2d')` en `setupTests.ts` con `clearRect`, `fillRect` y `drawImage` spy-ables. También se añade `cleanup()` explícito porque RTL no lo llama automáticamente sin globals de Vitest.

## 14. Decisiones tomadas en iter-017 (chunk bitmap cache)

- **`chunkBitmapCache.ts`**: Módulo interno (no exportado desde `index.ts`). Expone `RenderedChunk`, `ChunkBitmapCache` (interfaz), `createChunkBitmapCache()` y `renderChunkBitmap()`.
- **Pre-render al recibir tiles**: En `loadChunk`, justo después de `decodeBase64RleV1`, se llama `renderChunkBitmap(...)` que crea un `HTMLCanvasElement` de 128×128 px (1 px/tile) y pinta cada tile con `fillRect(tx, ty, 1, 1)`. Los tiles negativos (aire) se omiten.
- **`drawImage` en el RAF**: El loop de render reemplaza el `for-loop fillRect` por `ctx.drawImage(rendered.canvas, pixelX, pixelY, pixelSize, pixelSize)`. `ctx.imageSmoothingEnabled = false` asegura nearest-neighbor al escalar.
- **HTMLCanvasElement vs OffscreenCanvas**: Se usa `HTMLCanvasElement` (compatible con jsdom). `OffscreenCanvas` queda como optimización futura (requiere estrategia de mock diferente en tests o feature-detection en runtime).
- **`chunkCacheRef` conservado**: Mantiene los `Int16Array` raw para deduplicar fetches. Podría eliminarse en refactor futuro si `bitmapCacheRef` se usa como fuente de verdad.

## 13. Decisiones tomadas (bugfix viewport-inicial 2026-04-27)

- Viewport arrancaba en `panX:0, panY:0` (top-left = cielo puro). Invisible porque el renderer omite `tileId < 0` (aire).
- Fix: `viewInitializedRef` flag; en el primer disparo de ResizeObserver, se calcula pan para centrar en `(world_width/2, floor(world_height/5))` (~20% depth ≈ superficie).
- `world_height/5` es heurístico: superficie Terraria oscila entre ~15-25% de profundidad según tamaño; el valor 20% funciona para small/medium/large.
- `spawnX`/`spawnY` no están en el contrato API (no en `WorldMetadata`). Si se añaden en el futuro, priorizar spawn sobre la heurística.
- Añadidos tests T-07 (actualizado), T-09 (actualizado), T-11 (nuevo).

## 12. Deuda / follow-ups

- **Reemplazar tipos locales por F1**: Cuando F1 (api-client) esté cerrado, sustituir `import type { ... } from './types'` por `import type { ... } from '../api-client'` y borrar `types.ts`. Verificar compatibilidad estructural (WorldMetadata, TilesChunk, ApiClient).
- **OffscreenCanvas**: `renderChunkBitmap` usa `HTMLCanvasElement`. Migrar a `OffscreenCanvas` para eliminar overhead de DOM en el hilo principal. Requiere feature-detection (`typeof OffscreenCanvas !== 'undefined'`) y actualización del mock en tests.
- **Eliminar `chunkCacheRef`**: Los `Int16Array` raw ya no se usan en el render loop. Si no hay otro consumidor futuro (mipmap), se puede eliminar y usar `bitmapCacheRef` para deduplicar fetches.
- **Mipmap zoom-out**: SP-08 del doc menciona chunks "mipmap" reducidos para zoom extremo. No implementado en v1.
- **Pinch-to-zoom táctil**: SP-04. No implementado en v1; requires TouchEvent handling.
- **Animación en centerOn**: SP-07 menciona animación opcional. v1 hace jump instantáneo.
- **worldId change**: Si el padre cambia `worldId` sin desmontar (raro, pero posible), `chunkCacheRef`, `bitmapCacheRef` y `pendingRef` quedan obsoletos. Añadir `useEffect([worldId])` que llame `bitmapCacheRef.current.clearWorld(prevWorldId)` y limpie los otros caches.
- **Centrar en spawn real**: Si B5/B1 exponen `spawnX`/`spawnY` en `WorldMetadata`, reemplazar la heurística `height/5` por las coordenadas de spawn reales. Anotar en B5 deuda.

### Evolución propuesta para paridad con TerraMap

Referencia local acotada:
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\main.js`
  - leer solo `getTileColor`, `resizeCanvases`, `getMousePos`, `drawSelectionIndicator`, `saveMapImage`.
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\MapHelper.js`
  - leer solo tablas `tileColors`, `wallColors`, `liquidColors` y la lógica de capas de cielo/tierra/roca/infierno.

Brechas actuales:
- `tileColors.ts` es una paleta mínima; TerraMap cubre cientos de tiles, walls y líquidos.
- el chunk actual solo contiene `tile_id`; no se pueden pintar paredes, líquidos ni capas de fondo con fidelidad.
- no hay selección visual de tile ni información de hover/click.
- no hay zoom-to-fit ni export PNG.

Cambios candidatos:
- corregir doc/implementación de `base64-rle-v1`: usar `Int16Array`, no `Uint16Array`.
- si B5 expone `map_color`, renderizar por color directo para alcanzar paridad visual rápido.
- si B5 expone datos enriquecidos, mover la lógica `getTileColor` a una función pura testeada.
- ampliar `WorldCanvasHandle` con `zoomToFit()`, `getViewport()` y/o `exportImage()` solo si F6 lo necesita.
- emitir `onTileHover`/`onTileSelect` para que F6 muestre panel de información sin acoplar F3 a API REST.

Tests mínimos futuros:
- renderiza wall/liquid/map_color según encoding elegido.
- `zoomToFit` deja el mundo visible dentro del viewport.
- click/hover emite coordenadas estables tras pan/zoom.
- export PNG compone canvas base + overlay cuando F6 lo conecte.
