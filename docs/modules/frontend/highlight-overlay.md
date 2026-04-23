# Módulo `F5 – highlight-overlay`

## 1. Propósito
Pintar por encima del canvas del mundo un resaltado **muy visible** de los tiles donde se encontró el ítem buscado: halo pulsante, contorno llamativo, posibles flechas/pings. Es un overlay independiente que reutiliza el mismo sistema de coordenadas del `world-canvas`.

## 2. Contrato público

```ts
// src/highlight-overlay/index.ts
export interface HighlightOverlayProps {
  canvasHandle: WorldCanvasHandle | null;   // del world-canvas
  matches: SearchMatch[];                   // coincidencias a resaltar
  style?: "pulse" | "outline" | "ping";     // default "pulse"
  color?: string;                           // default "#FFEB3B" (amarillo Terraria-like)
}

export const HighlightOverlay: React.FC<HighlightOverlayProps>;
```

## 3. Dependencias
- `F3 world-canvas` (usa su `WorldCanvasHandle` para `worldToScreen`).
- React 18.

## 4. No objetivos
- No realiza la búsqueda.
- No modifica el contenido del canvas de tiles; pinta en un canvas propio encima.

## 5. Especificación (SDD)
- **SP-01** Renderiza un `<canvas>` absolutamente posicionado encima del canvas principal, con el mismo tamaño.
- **SP-02** Por cada `match`, dibuja un halo pulsante centrado en `worldToScreen(match.x, match.y)`.
- **SP-03** La pulsación es visible incluso sobre fondos claros u oscuros (usa combinación de trazo oscuro + relleno claro semitransparente).
- **SP-04** Se reajusta al pan y zoom en cada frame (`requestAnimationFrame`).
- **SP-05** Si `matches` está vacío, el overlay no se dibuja (canvas limpio).
- **SP-06** Si hay muchos matches (> 500), se degrada a estilo "outline" simple para preservar fps.
- **SP-07** No intercepta eventos de mouse/teclado (`pointer-events: none`).

## 6. Plan de tests (TDD)
Funciones puras (extraíbles):
- [ ] `T-01 computeHaloRadius scales with zoom`
- [ ] `T-02 pulsePhase wraps over time period`

Componente:
- [ ] `T-03 renders no strokes when matches is empty`
- [ ] `T-04 draws one halo per match at correct screen coords` (mock canvas context)
- [ ] `T-05 degrades to outline style when matches > 500`
- [ ] `T-06 unmounts and stops animation frame`
- [ ] `T-07 pointer-events is none`

## 7. Notas de implementación
- El overlay mantiene un `ref` al canvas y usa `useEffect` para registrar el loop de rAF. Limpiar al desmontar.
- Para testear: mockear `HTMLCanvasElement.prototype.getContext` devolviendo un stub que grabe llamadas (`arc`, `stroke`, `fill`).
- El color y estilo pueden evolucionar a partir de una pequeña paleta temática; queda abierto en "Deuda".

## 8. Performance
- Objetivo: < 2 ms por frame para 100 matches. Usar `Path2D` y batching.

## 9. Errores
- Ninguno esperado.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —