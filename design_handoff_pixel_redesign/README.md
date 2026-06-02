# Handoff: Rediseño pixel-art "Pixel Forge" de TerraScrap

> Para el agente (Claude Code) que va a aplicar esto en el repo real `TerraScrap/frontend`.
> Trabaja **un módulo por iteración** siguiendo el ciclo SDD → TDD del `PROJECT.md`.
> Tras cada módulo: `npm run lint`, `tsc -b`, y los tests del módulo deben pasar antes de cerrar.

---

## 1. Overview

Rediseño visual completo del frontend de TerraScrap a una estética **pixel-art fiel a Terraria**:
frames biselados estilo inventario, tipografía pixel, terreno en bloques y marcadores cuadrados pulsantes.

**Importante:** esto es **sólo un cambio de capa de presentación**. La lógica, el estado (`appState.ts`,
reducers), los contratos de API, los componentes y sus tests **no cambian de comportamiento**. Sólo se
tocan: marcado JSX (clases y estructura de wrappers), archivos `.css`, y el dibujado en canvas de
`highlight-overlay`. Ningún cambio de contrato público — por tanto, ningún cambio en los tests de
comportamiento (sí puede haber ajustes en tests que asserten clases CSS concretas, si los hubiera).

## 2. Sobre los archivos de diseño

Los archivos en `design_files/` son **una referencia de diseño hecha en HTML/CSS/JS vanilla** — un
prototipo que muestra el aspecto y el comportamiento deseados, **no código para copiar tal cual**. La
tarea es **recrear ese diseño dentro del entorno existente** (React 19 + TypeScript + Vite + CSS plano
por módulo), reutilizando los componentes, el estado y los contratos que ya existen.

- `design_files/styles.css` → **la fuente de verdad del diseño**. Tokens, técnica de biseles y todas las
  reglas por componente están aquí. Es lo que se porta.
- `design_files/TerraScrap.html` → muestra la estructura de marcado y qué clases envuelven a qué.
- `design_files/app.js` y `design_files/data.js` → **NO portar**. Son un simulacro del backend
  (catálogo de ítems, resultados de búsqueda, NPCs) y de la lógica de interacción que en el repo real ya
  está implementada en React (`SearchPanel.tsx`, `App.tsx`, reducers, `api-client`). Sólo sirven para que
  el prototipo funcione de forma autónoma. Úsalos como referencia de *comportamiento esperado*, no como
  código a integrar.

## 3. Fidelidad: **Hi-fi**

Mockup de alta fidelidad. Reproducir colores, tipografía, espaciado, biseles y estados con precisión.
Todos los valores exactos están en la sección 5 (Design Tokens) y en `design_files/styles.css`.

---

## 4. La primitiva visual central: el bisel pixel

Todo el sistema se construye sobre un **marco biselado 3D pixelado** (luz arriba/izquierda, sombra
abajo/derecha) en lugar de `border-radius`/`box-shadow` suaves. Define estas dos variables una vez y
reutilízalas en TODOS los contenedores/botones:

```css
--bevel-raise: inset 2px 2px 0 0 var(--bevel-lt), inset -2px -2px 0 0 var(--bevel-dk); /* sobresale */
--bevel-sink:  inset 2px 2px 0 0 var(--bevel-dk), inset -2px -2px 0 0 var(--bevel-lt); /* hundido */
```

- Contenedores/paneles/botones en reposo → `box-shadow: var(--bevel-raise);`
- Inputs, slots de ítem, estados "pulsados/activos" → `var(--bevel-sink);`
- Botón al hacer `:active` → invertir a `--bevel-sink` + `transform: translate(1px,1px);`
- **Radios a 0** en todo el árbol (`--r-*: 0px`). Nada de esquinas redondeadas.

Reglas globales obligatorias (van en el archivo de tokens global):
```css
body { -webkit-font-smoothing: none; font-smooth: never; }   /* texto crujiente */
img, canvas { image-rendering: pixelated; }                  /* tiles nítidos */
```

---

## 5. Design Tokens (copiar literal)

Crear `src/theme.css` e importarlo **una sola vez** en `src/main.tsx` (antes de los CSS de componente).
Tipografía vía Google Fonts (añadir el `@import` al inicio de `theme.css` **o** `<link>` en `index.html`).

```css
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Pixelify+Sans:wght@400;500;600;700&family=VT323&display=swap');

:root {
  /* Superficies (azul-pizarra Terraria, cueva profunda) */
  --bg-void: oklch(0.165 0.028 268);
  --bg-base: oklch(0.205 0.032 268);
  --bg-panel: oklch(0.255 0.038 268);
  --bg-raised: oklch(0.305 0.042 268);
  --bg-hover: oklch(0.355 0.046 268);
  --bg-input: oklch(0.17 0.03 268);

  /* Bordes / biseles */
  --bevel-lt: oklch(0.52 0.05 268);
  --bevel-dk: oklch(0.11 0.022 268);
  --line: oklch(0.40 0.04 268);
  --line-soft: oklch(0.30 0.035 268);
  --line-strong: oklch(0.5 0.05 268);

  /* Texto */
  --ink: oklch(0.95 0.01 90);
  --ink-mid: oklch(0.78 0.02 250);
  --ink-dim: oklch(0.62 0.025 255);
  --ink-faint: oklch(0.5 0.025 258);

  /* Oro tesoro (acento primario) */
  --gold: oklch(0.81 0.15 82);
  --gold-bright: oklch(0.88 0.16 88);
  --gold-deep: oklch(0.64 0.13 70);
  --gold-glow: oklch(0.81 0.15 82 / 0.45);

  /* Madera (acentos del landing) */
  --wood: oklch(0.46 0.07 58);
  --wood-dk: oklch(0.34 0.055 55);

  /* Paleta por fuente de coincidencia (rarezas Terraria) */
  --src-chest: oklch(0.81 0.15 82);    /* oro   */
  --src-block: oklch(0.78 0.17 150);   /* verde */
  --src-wall: oklch(0.72 0.15 252);    /* azul  */
  --src-object: oklch(0.74 0.18 330);  /* rosa  */

  --danger: oklch(0.62 0.2 28);
  --danger-bright: oklch(0.72 0.21 30);

  --r-sm: 0px; --r-md: 0px; --r-lg: 0px; --r-xl: 0px;

  --shadow-md: 4px 4px 0 oklch(0.1 0.02 268 / 0.55);
  --shadow-lg: 8px 8px 0 oklch(0.08 0.02 268 / 0.6);

  --font-display: 'Press Start 2P', monospace;   /* marca, títulos, eyebrows — usar a tamaños pequeños */
  --font-ui: 'Pixelify Sans', system-ui, sans-serif; /* UI y cuerpo */
  --font-mono: 'VT323', ui-monospace, monospace;  /* coordenadas, IDs, datos numéricos */

  --bevel-raise: inset 2px 2px 0 0 var(--bevel-lt), inset -2px -2px 0 0 var(--bevel-dk);
  --bevel-sink:  inset 2px 2px 0 0 var(--bevel-dk), inset -2px -2px 0 0 var(--bevel-lt);
}
```

**Reglas tipográficas:** Press Start 2P SÓLO en marca / títulos hero / eyebrows en mayúsculas (9–16px,
nunca para párrafos). Pixelify Sans para toda la UI (14–17px). VT323 para coordenadas / IDs / cantidades
(rinde grande y legible, 15–17px). Mapea las variables existentes del repo a estas si las hubiera.

---

## 6. Plan de integración por módulo (orden recomendado)

> En `design_files/styles.css` encontrarás el bloque CSS completo de cada clase mencionada. El mockup usa
> nombres de clase propios; abajo se indica a qué archivo y a qué clases existentes del repo corresponde.

### Iteración A — Tokens globales (fundación)
- **Archivos:** crear `src/theme.css`; importarlo en `src/main.tsx`.
- **Qué:** pegar el bloque `:root` + el `@import` de fuentes + las reglas globales (font-smoothing none,
  image-rendering pixelated) de la sección 4–5.
- **Gotcha:** importar `theme.css` ANTES que cualquier CSS de componente para que las variables existan.

### Iteración B — `ui-upload` + landing (rama NoWorld de app-shell)
- **Archivos:** `ui-upload/UploadWorld.tsx` + `ui-upload/UploadWorld.css`; `app-shell/App.tsx`
  (rama `state.kind === 'NoWorld'`) + `app-shell/App.css`.
- **Qué:**
  - El **landing con hero + features** vive en la rama NoWorld de `App.tsx` (hoy sólo `<h1>TerraScrap</h1>`
    + `<UploadWorld/>`). Recrea la estructura del mockup: `.landing` (grid 2 col) → izquierda `.landing-pitch`
    (marca, `.landing-kicker`, `<h1>` con `.accent` en oro, `.landing-lede`, `.landing-features` con 3
    `.feature`), derecha `.landing-stage` que contiene `<UploadWorld/>`.
  - **`UploadWorld.tsx`**: reemplaza las clases `.upload-dropzone`/`.upload-hint`/`.upload-progress`/
    `.upload-error`/`.upload-retry` por el diseño `.dropzone` del mockup (slot interior con borde discontinuo
    vía `::before`, `.dropzone-icon`, `<h2>`, `<p>`, `.dropzone-cta`, `.upload-bar` segmentada, `.dropzone-note`).
    Conserva `aria-*`, el input `.sr-only`, los handlers y la `Phase` ('idle'|'uploading'|'success'|'error').
  - Sustituye los textos en inglés ("Drop a .wld file here") por los del mockup en español.
- **Gotcha:** la barra de progreso del mockup usa `width %` con `transition: width .2s steps(8)` (no el
  sweep infinito actual). El `%` real ya lo tienes en `progress`/`onProgress`.

### Iteración C — `app-shell` topbar, toolbar y layout
- **Archivos:** `app-shell/App.tsx` (header + `.app-main`), `components/Toolbar.tsx`, `app-shell/App.css`.
- **Qué:**
  - Header `.topbar` (alto 60): `.brand` (glyph + "Terra**Scrap**"), `.topbar-divider`, `.world-tag`
    (`.seed-dot` + `.wt-name` + `.wt-meta` mono con tamaño·versión), luego `<Toolbar/>` y a la derecha
    `.btn-ghost.danger` "Cerrar mundo".
  - **`Toolbar.tsx`**: re-estilar `app-toolbar` / `app-toolbar-group` / `app-toolbar-btn` con
    `.toolbar`/`.tool-group`/`.tool-btn` del mockup (biselados; `.active` en oro con `--bevel-sink`).
    **Mantén** los botones e iconos/labels actuales (+ / − / Reset / Fit, layers, Máscara, PNG) y toda la
    lógica (`applyZoom`, `handleExportPng`, `handleZoomToFit`). Puedes meter los iconos SVG del mockup
    dentro de los `<button>` existentes sin tocar handlers.
  - `.app-main` → grid `var(--sidebar-w) minmax(0,1fr)` (sidebar 352px).
- **Gotcha:** el repo ya tiene clases `app-toolbar*`; reescribe sus reglas en `App.css`, no inventes
  clases nuevas salvo para wrappers que no existan (`.tool-group` ↔ `.app-toolbar-group`).

### Iteración D — `search-panel` (mayor ganancia visual; hoy sin estilar)
- **Archivos:** `search-panel/SearchPanel.tsx` (+ crear `search-panel/SearchPanel.css`).
- **Qué:** el componente hoy renderiza `<section>` sin clases. Aplica la estructura del mockup conservando
  TODA la lógica (combobox ARIA, debounce, virtualización, filtros, navegación n/p):
  - Caja `.search-panel` → `.search-box` con `.search-icon`, `.search-input`, `.search-clear`, y el
    dropdown `.autocomplete`/`.ac-item` (`.ac-sprite`, `.ac-name`, `.ac-id` mono).
  - `.search-opts`: el checkbox "Incluir contenedores" como `.toggle` (switch biselado) + hint `.kbd`.
  - `.results-meta` (`.results-count` con `<b>` en oro + `.nav-mini` prev/next).
  - Filtros por fuente → `.source-filters`/`.src-chip` (con `.swatch` del color de la fuente y `.n`).
    Estado oculto = `.src-chip.off`.
  - Lista virtual → cada fila como `.match` (`.match-badge` con icono+color por fuente, `.match-main`
    con `.match-title` y `.match-sub` mono, botón `.match-go` "Centrar"). Fila enfocada = `.match.active`.
  - Mapea los colores por fuente a `--src-chest/block/wall/object` y los iconos a los SVG del mockup
    (`design_files/data.js` → objeto `ICONS`/`SOURCE_META`).
- **Gotcha:** la lista usa virtualización (ROW_HEIGHT=40). Si cambias la altura de fila visual, ajusta
  `ROW_HEIGHT` en consecuencia para que el cálculo del viewport virtual siga cuadrando.

### Iteración E — paneles del sidebar
- **`components/WorldPropertiesPanel.tsx`** → `.panel`/`.panel-head` (eyebrow + `.chevron` colapsable) +
  `.prop-grid` (`dt` dim / `dd` mono a la derecha; usa `.tag` verde y `.hard` rojo para Maldad/Dificultad).
- **`components/NpcPanel.tsx`** → `.npc-list` con filas `.npc` (`.npc-av` cuadrado biselado, `.npc-name`,
  `.npc-loc` mono). El toggle del panel: `.count-pill` en oro.
- **`components/TileDetailPanel.tsx`** → `.tile-detail` (`.td-head` con badge+label+`.coord` oro+`.td-close`;
  `.td-body` con `.td-row` k/v). Si la fuente es cofre, añade `.td-chest` + `.chest-grid` (20 `.slot`s
  cuadrados biselados; el slot del ítem encontrado = `.slot.found` resaltado en oro; cantidades en `.qty`).
- **Gotcha:** respeta los toggles/colapsado existentes (`state.panels`, `TOGGLE_PANEL`). Sólo cambia el
  envoltorio visual.

### Iteración F — chrome del mapa (en app-shell, sobre `.app-canvas-container`)
- **Archivos:** `app-shell/App.tsx` + `App.css`.
- **Qué:** añadir como hijos absolutos del contenedor del canvas: `.coord-readout` (X/Y en oro, top-left),
  `.map-hud` (stack de `.hud-btn` +/−/centrar, bottom-right) cableado a `canvasHandle.setZoom`, `.map-legend`
  (bottom-left, recuento por fuente) y `.map-toast` (aviso "Mundo revelado…"). Estos son chrome flotante;
  no tocan el render del mundo.
- **NO** portes `.world`/`.map-grid` del mockup: eso es un placeholder. Tu `world-canvas` ya pinta el mundo
  real — sólo asegúrate de que su `<canvas>` lleva `image-rendering: pixelated`.

### Iteración G — `highlight-overlay` (marcadores pixel en canvas) — la más técnica
El overlay real es **canvas**, no DOM. Hay que traducir el marcador cuadrado pixelado del mockup al dibujado:
- En `HighlightOverlay.tsx`, pasa desde `App.tsx` la prop `colorBySource` con los hexes equivalentes a la
  paleta (convierte los oklch a hex, p. ej. chest≈`#E8B24C`, block≈`#3FD27E`, wall≈`#5B8DEF`, object≈`#E86FC4`;
  ajusta a tu gusto). Mantén `style="pulse"` por defecto y `"mask"` para el modo foco.
- Reescribe `drawHaloMatch` para que sea **cuadrado/pixel**: en vez de `arc`, usa `strokeRect` con
  `lineWidth: 3`, un borde oscuro exterior (`--bevel-dk`) y el color de la fuente; el "ping" = `strokeRect`
  que crece (de `haloR` a ~`haloR*2`) con alpha decreciente, en pasos discretos para un look pixel.
- Para la coincidencia **enfocada/seleccionada** dibuja además la **crosshair** (dos líneas finas largas,
  alpha ~0.5) como en `.marker.focused` del mockup.
- El `drawMaskMode` ya hace exactamente el "modo foco" del mockup (oscurece todo y recorta los matches) —
  resérvalo para `maskMode`. El brillo del mundo (`brightness(0.3)`) lo aplica el modo foco sobre el canvas
  del mundo; ya lo cubre `style="mask"`.
- **Tooltips/etiquetas de marcador** (`.marker .tip`) son texto: o los dibujas con `fillText` sobre el
  canvas, o (más fiel y simple) los pones como `<div>` DOM absolutos posicionados con
  `canvasHandle.worldToScreen(x,y)` por encima del overlay. Opción DOM recomendada para clonar 1:1.
- **Gotcha:** `computeHaloRadius`, `pulsePhase`, `resolveMatchColor`, el umbral `OUTLINE_THRESHOLD=500`
  (degradación a outline) y los tests de `math.ts` deben seguir pasando. Cambia el *dibujado*, no las
  utilidades de posición.

---

## 7. Interacciones y estados (ya implementados — sólo referencia visual)

Todo esto YA existe en el repo; el rediseño sólo cambia su aspecto. Verifica que cada estado tiene su
tratamiento pixel:
- **Upload:** idle / dragging (`.dropzone.drag`) / uploading (`.dropzone.loading` + `.upload-bar`) / error
  (`.upload-error` + retry).
- **Búsqueda:** sin selección (empty-state "busca un ítem"), cargando, sin coincidencias (`.empty-state`),
  con resultados (meta + filtros + lista), filtros por fuente on/off.
- **Foco de coincidencia:** fila `.match.active` + marcador `.marker.focused` (crosshair) + tile detail.
- **Modo foco/máscara:** `maskMode` → overlay oscurece el mundo y resalta sólo matches.
- **Toast de error** (`.toast`) abajo-centro para sesión perdida, etc.
- **Atajos:** `/` foco búsqueda · `n`/`p` navegar · `Esc` limpiar (ya en `SearchPanel`/`App`).

## 8. Animaciones

- Marcador: pulso `ping` con `steps(6)` (pixelado, no suave). Periodo ~1.6s; enfocado crece más (`ping-lg`).
- Botones: `:active` → `translate(1px,1px)` + invertir bisel. Transiciones cortas (0.06–0.1s).
- Toggle switch: el thumb se desplaza con `transition: transform .1s steps(3)`.
- Barra de carga: `width` con `steps(8)`.
- Respeta `prefers-reduced-motion` si el repo ya lo contempla.

## 9. Design Tokens — resumen rápido (hex aproximados para canvas)

Para sitios que necesiten hex (canvas), equivalentes aproximados de la paleta de fuentes:
`chest #E8B24C` · `block #3FD27E` · `wall #5B8DEF` · `object #E86FC4` · `gold #E8B24C` · `danger #E0533B`.
Para CSS, usa siempre las variables oklch (sección 5).

## 10. Archivos de referencia en este bundle

```
design_files/
├── TerraScrap.html   # estructura de marcado + qué clases envuelven qué
├── styles.css        # FUENTE DE VERDAD del diseño (tokens + todas las reglas)
├── app.js            # simulacro de lógica (NO portar; referencia de comportamiento)
└── data.js           # simulacro de datos: SOURCE_META, ICONS (úsalos para iconos/colores)
```

## 11. Definición de "done" (por el PROJECT.md)

Por cada iteración: contrato público intacto, `tsc -b` + ESLint/Prettier sin warnings, tests del módulo en
verde, y los tests de integración de quien dependa de él sin romperse. Cierra la iteración actualizando la
sección "Estado" del doc del módulo. Una brecha visual → una iteración; no refactor transversal.
