const BASE_RADIUS_PX = 8;

export function computeHaloRadius(zoom: number): number {
  return Math.max(6, Math.min(24, BASE_RADIUS_PX * Math.log2(zoom + 1)));
}

export function pulsePhase(time: number, period: number): number {
  if (period <= 0) return 0;
  return (time % period) / period;
}

export function tileToScreen(
  tileX: number,
  tileY: number,
  zoom: number,
  panX: number,
  panY: number
): { px: number; py: number } {
  return { px: tileX * zoom + panX, py: tileY * zoom + panY };
}

export const DEFAULT_SOURCE_COLORS: Record<string, string> = {
  block: '#3FD27E',
  wall: '#5B8DEF',
  chest: '#E8B24C',
  object: '#E86FC4',
  liquid: '#2196F3',
  tile_entity: '#4CAF50',
};

export function resolveMatchColor(
  source: string,
  colorBySource: Partial<Record<string, string>> | undefined,
  fallback: string
): string {
  return colorBySource?.[source] ?? DEFAULT_SOURCE_COLORS[source] ?? fallback;
}
