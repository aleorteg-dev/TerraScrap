# Módulo `F5 – highlight-overlay`

## 1. Propósito
Pintar por encima del canvas del mundo un resaltado **muy visible** de los tiles donde se encontró el ítem buscado: halo pulsante, contorno llamativo, modo máscara (oscurece todo excepto los matches), marcador animado del tile seleccionado. Es un overlay independiente que reutiliza el mismo sistema de coordenadas del `world-canvas`.

## 2. Contrato público (v2)

```ts
// src/highlight-overlay/index.ts
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface HighlightOverlayProps {
  canvasHandle: WorldCanvasHandle | null;
  matches: SearchMatch[];
  style?: "pulse" | "outline" | "ping" | "mask";  // default "pulse"
  color?: string;                                   // fallback color (default "#FFEB3B")
  colorBySource?: Partial<Record<"block"|"wall"|"chest"|"object"|"liquid"|"tile_entity", string>>;
  selectedTile?: { x: number; y: number } | null;
  viewport?: Viewport;  // cuando se provee, usa zoom/panX/panY directamente
}

export const HighlightOverlay: React.FC<HighlightOverlayProps>;
export const DEFAULT_SOURCE_COLORS: Record<string, string>;
export function resolveMatchColor(
  source: string,
  colorBySource: Partial<Record<string, string>> | undefined,
  fallback: string,
): string;
```

**Colores por defecto por source:**

| source | color |
|--------|-------|
| `block` | `#FFEB3B` (amarillo) |
| `wall` | `#00BCD4` (cian) |
| `chest` | `#FF9800` (naranja) |
| `object` | `#E040FB` (magenta) |
| `liquid` | `#2196F3` (azul) — futuro |
| `tile_entity` | `#4CAF50` (verde) — futuro |

## 3. Dependencias
- `F3 world-canvas` (usa su `WorldCanvasHandle` para `worldToScreen` como fallback).
- React 19.

## 4. No objetivos
- No realiza la búsqueda.
- No modifica el contenido del canvas de tiles; pinta en un canvas propio encima.

## 5. Especificación (SDD)
- **SP-01** Renderiza un `<canvas>` absolutamente posicionado encima del canvas principal, con el mismo tamaño.
- **SP-02** Por cada `match`, dibuja un halo pulsante centrado en la posición del tile.
- **SP-03** La pulsación es visible incluso sobre fondos claros u oscuros (usa combinación de trazo oscuro + relleno claro semitransparente).
- **SP-04** Se reajusta al pan y zoom en cada frame (`requestAnimationFrame`).
- **SP-05** Si `matches` está vacío (y `selectedTile` es null/undefined), el overlay no se dibuja (canvas limpio).
- **SP-06** Si hay muchos matches (> 500) y `style !== "mask"`, se degrada a estilo "outline" simple para preservar fps.
- **SP-07** No intercepta eventos de mouse/teclado (`pointer-events: none`).
- **SP-08** Cuando se provee `viewport`, las coordenadas de pantalla se calculan como `tileX * zoom + panX` sin llamar a `worldToScreen`.
- **SP-09** `style="mask"`: oscurece el canvas completo con `rgba(0,0,0,0.65)`, luego usa `globalCompositeOperation = "destination-out"` para "agujerear" cada match (1 tile = zoom×zoom px). Finalmente dibuja bordes del color del source.
- **SP-10** `selectedTile`: dibuja borde animado `rgba(255,80,80,α)` con α pulsante incluso si `matches` está vacío.
- **SP-11** Cada source produce color distinto por defecto; `colorBySource` permite override por source.

## 6. Plan de tests (TDD)

Funciones puras (`math.ts`):
- [x] `T-01 computeHaloRadius scales with zoom`
- [x] `T-02 pulsePhase wraps over time period`
- [x] `T-10a..g resolveMatchColor — color por source y overrides`

Componente:
- [x] `T-03 renders no strokes when matches is empty`
- [x] `T-04 draws one halo per match at correct screen coords`
- [x] `T-05 degrades to outline style when matches > 500`
- [x] `T-06 unmounts and stops animation frame`
- [x] `T-07 pointer-events is none`
- [x] `T-08 viewport zoom=2 draws highlights at viewport-computed coords`
- [x] `T-09 mask mode sets globalCompositeOperation to destination-out`
- [x] `T-09b mask mode dark overlay uses fillRect for entire canvas`
- [x] `T-11 selectedTile draws animated border with strokeRect`
- [x] `T-11b selectedTile with viewport uses viewport coords`
- [x] `T-11c null selectedTile draws nothing when matches empty`

## 7. Notas de implementación
- El overlay mantiene un `ref` al canvas y usa `useEffect` para registrar el loop de rAF. Limpiar al desmontar.
- `viewport` prop reemplaza la derivación del zoom vía dos llamadas a `worldToScreen`. Cuando se provee, también se usan `tileToScreen(x, y, zoom, panX, panY)` para coordenadas de pantalla.
- `resolveMatchColor` y `DEFAULT_SOURCE_COLORS` viven en `math.ts` (funciones puras, sin React) para respetar `react-refresh/only-export-components`.
- Modo mask: no usa `ctx.save()/restore()` — asigna y reestablece `globalCompositeOperation` manualmente.

## 8. Performance
- Objetivo: < 2 ms por frame para 100 matches. Usar `Path2D` y batching si necesario (no implementado).
- Modo mask evita N arcos en escenarios de muchos matches.

## 9. Errores
- Ninguno esperado.

## 10. Estado
- **Versión del contrato**: v2
- **Último cierre**: 2026-05-11 (iter-17)
- **Iteración actual**: cerrada
- **Decisiones tomadas**:
  - `viewport` prop es opcional; cuando ausente se mantiene comportamiento v1 (derivación zoom + worldToScreen).
  - `resolveMatchColor` y `DEFAULT_SOURCE_COLORS` exportados desde `math.ts` para evitar la violación de `react-refresh/only-export-components`.
  - Degradación a outline solo si `style !== 'mask'` (mask no degrada).
  - Colores por defecto documentados: block=amarillo, wall=cian, chest=naranja, object=magenta, liquid=azul, tile_entity=verde.
  - `selectedTile` dibuja `strokeRect(px, py, zoom, zoom)` con alpha pulsante; se dibuja aunque `matches` esté vacío.
- **Deuda / follow-ups**:
  - Integración F6 cubierta por tests de `app-shell` para composición de canvas/export y propagación de matches filtrados; sigue pendiente una prueba visual con canvas real en navegador.
  - `Path2D` batching para > 1000 matches no implementado (aplazado a iter de perf).

### Evolución propuesta para paridad con TerraMap

**Implementado en iter-17:**
- Modo `mask`: `style="mask"` oscurece canvas con destination-out por match.
- Colores por `source`: block/wall/chest/object/liquid/tile_entity.
- `selectedTile` con borde rojo animado.
- `viewport` prop que reemplaza la derivación interna del zoom.
