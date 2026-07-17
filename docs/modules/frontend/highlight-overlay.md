# Módulo `F5 – highlight-overlay`

## 1. Propósito
Pintar por encima del canvas del mundo un resaltado **muy visible** de los tiles donde se encontró el ítem buscado: halo pulsante, contorno llamativo, modo máscara (oscurece todo excepto los matches), marcador animado del tile seleccionado. Es un overlay independiente que reutiliza el mismo sistema de coordenadas del `world-canvas`.

## 2. Contrato público (v3 — IT-11)

```ts
// src/highlight-overlay/index.ts
export interface HighlightOverlayProps {
  canvasHandle: WorldCanvasHandle | null;
  matches: SearchMatch[];
  style?: "pulse" | "outline" | "ping" | "mask";  // default "pulse"
  color?: string;                                   // fallback color (default "#FFEB3B")
  colorBySource?: Partial<Record<"block"|"wall"|"chest"|"object", string>>;
  selectedTile?: { x: number; y: number } | null;
}

export const HighlightOverlay: React.FC<HighlightOverlayProps>;
export const DEFAULT_SOURCE_COLORS: Record<string, string>;
export function resolveMatchColor(
  source: string,
  colorBySource: Partial<Record<string, string>> | undefined,
  fallback: string,
): string;
```

Breaking menor v3 (IT-11, M16): eliminados `Viewport` y la prop `viewport` —
la app nunca los pasaba y duplicaban el camino `canvasHandle` (solo los usaban
los tests). Las coordenadas de pantalla se derivan siempre de
`canvasHandle.worldToScreen`.

**Colores por defecto por source:**

| source | color |
|--------|-------|
| `block` | `#3FD27E` (verde) |
| `wall` | `#5B8DEF` (azul) |
| `chest` | `#E8B24C` (ámbar) |
| `object` | `#E86FC4` (magenta) |

Reservados para v0.3 (M14 — el contrato v0.2 no puede emitirlos; se
reintroducirán con IT-OPT/v0.3): `liquid: '#2196F3'`, `tile_entity: '#4CAF50'`.

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
- **SP-05** (modo reposo, IT-11/P05) Si `matches` está vacío y `selectedTile` es null/undefined, el overlay se limpia **una vez** y el bucle rAF queda pausado — cero draws y cero frames hasta que un cambio de props vuelva a dar algo que pintar (el efecto se re-suscribe al cambiar `matches`/`selectedTile`/resto de props).
- **SP-06** Si hay muchos matches (> 500) y `style !== "mask"`, se degrada a estilo "outline" simple para preservar fps.
- **SP-07** No intercepta eventos de mouse/teclado (`pointer-events: none`).
- **SP-08** (IT-11, M16) Eliminado: las coordenadas se derivan siempre de `canvasHandle.worldToScreen` (la prop `viewport` ya no existe).
- **SP-12** (IT-11, P05) `colorWithAlpha` cachea el parse de cada hex (`parseHexRgb`, Map módulo-level): una regex por color único en toda la vida de la página, no una por match y frame.
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
- [x] `T-09 mask mode sets globalCompositeOperation to destination-out`
- [x] `T-09b mask mode dark overlay uses fillRect for entire canvas`
- [x] `T-11 selectedTile draws animated border with strokeRect`
- [x] `T-11c null selectedTile draws nothing when matches empty`
- (T-08 y T-11b eliminados en IT-11 con la prop `viewport`; el camino
  `canvasHandle` que queda ya está cubierto por T-04 y T-11)

IT-11 (P05, M14, M16):
- [x] `T-12 idle mode clears once and schedules no rAF loop when nothing to draw (P05)`
- [x] `T-12b resumes drawing when a match arrives after idle`
- [x] `T-13 colorWithAlpha parses each hex color only once thanks to the module cache (P05)`
- [x] `T-13b formats rgba from the cached parse and passes through non-hex input`
- [x] `T-14 DEFAULT_SOURCE_COLORS only covers contract v0.2 sources (M14)`

## 7. Notas de implementación
- El overlay mantiene un `ref` al canvas y usa `useEffect` para registrar el loop de rAF. Limpiar al desmontar.
- Modo reposo (IT-11): el propio efecto decide si arranca el loop; con `matches` vacío y sin `selectedTile` limpia el canvas y retorna sin programar rAF.
- Zoom y coordenadas se derivan siempre de `canvasHandle.worldToScreen` (la prop `viewport` y `tileToScreen` se eliminaron en IT-11, M16).
- `resolveMatchColor`, `DEFAULT_SOURCE_COLORS` y `colorWithAlpha` (con caché `parseHexRgb`) viven en `math.ts` (funciones puras, sin React) para respetar `react-refresh/only-export-components`.
- Modo mask: no usa `ctx.save()/restore()` — asigna y reestablece `globalCompositeOperation` manualmente.

## 8. Performance
- Objetivo: < 2 ms por frame para 100 matches. Usar `Path2D` y batching si necesario (no implementado).
- Modo mask evita N arcos en escenarios de muchos matches.

## 9. Errores
- Ninguno esperado.

## 10. Estado
- **Versión del contrato**: v3 (IT-11: sin `Viewport`/`viewport`; `DEFAULT_SOURCE_COLORS` solo sources v0.2)
- **Último cierre**: 2026-07-17 — IT-11 (PLAN_REMEDIACION P05+M14+M16)
- **Iteración actual**: cerrada

### Cambios IT-11 🔶

- P05 — modo reposo: sin matches ni tile seleccionado el overlay limpia una vez
  y pausa el bucle rAF (antes corría a 60 fps siempre); se reanuda cuando un
  cambio de props vuelve a dar algo que pintar. `colorWithAlpha` movida a
  `math.ts` con caché `parseHexRgb` (Map hex → "r,g,b"): una regex por color
  único, no ~60k regex/s con 500 matches.
- M14 — `DEFAULT_SOURCE_COLORS` reducido a los 4 sources del contrato v0.2;
  `liquid`/`tile_entity` quedan reservados en §2.
- M16 — eliminados `Viewport`, la prop `viewport` y `tileToScreen` (breaking
  menor v3): la app nunca los pasaba; el único camino es `canvasHandle`.
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
