const BASE_RADIUS_PX = 8;

export function computeHaloRadius(zoom: number): number {
  return Math.max(6, Math.min(24, BASE_RADIUS_PX * Math.log2(zoom + 1)));
}

export function pulsePhase(time: number, period: number): number {
  if (period <= 0) return 0;
  return (time % period) / period;
}

// Solo los source que el contrato v0.2 puede emitir (IT-11, M14). Reservados
// para v0.3 en el doc del módulo: liquid '#2196F3', tile_entity '#4CAF50'.
export const DEFAULT_SOURCE_COLORS: Record<string, string> = {
  block: '#3FD27E',
  wall: '#5B8DEF',
  chest: '#E8B24C',
  object: '#E86FC4',
};

// Caché hex → "r,g,b" (IT-11, P05): una regex por color único en toda la vida
// de la página, no una por match y frame del bucle rAF. null = no era #rrggbb.
const _hexRgbCache = new Map<string, string | null>();

function parseHexRgb(hex: string): string | null {
  let cached = _hexRgbCache.get(hex);
  if (cached === undefined) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    cached = m
      ? `${parseInt(m[1] ?? '0', 16)},${parseInt(m[2] ?? '0', 16)},${parseInt(m[3] ?? '0', 16)}`
      : null;
    _hexRgbCache.set(hex, cached);
  }
  return cached;
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (rgb === null) return hex;
  return `rgba(${rgb},${alpha.toFixed(3)})`;
}

export function resolveMatchColor(
  source: string,
  colorBySource: Partial<Record<string, string>> | undefined,
  fallback: string
): string {
  return colorBySource?.[source] ?? DEFAULT_SOURCE_COLORS[source] ?? fallback;
}
