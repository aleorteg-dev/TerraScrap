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
- [ ] `T-01 screenToWorld maps correctly at zoom=1 and no pan`
- [ ] `T-02 screenToWorld is inverse of worldToScreen`
- [ ] `T-03 zoom around cursor preserves the world coordinate under the cursor`
- [ ] `T-04 clampZoom respects min/max`
- [ ] `T-05 visibleChunks returns only chunks intersecting viewport`

De componente:
- [ ] `T-06 renders canvas element with correct dimensions`
- [ ] `T-07 calls apiClient.getTilesChunk for initial viewport`
- [ ] `T-08 panning updates state and triggers redraw`
- [ ] `T-09 onTileClick receives correct tile coordinates`
- [ ] `T-10 onReady emits a handle with imperative API`

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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —