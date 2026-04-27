const BASE_RADIUS_PX = 8;

export function computeHaloRadius(zoom: number): number {
  return Math.max(6, Math.min(24, BASE_RADIUS_PX * Math.log2(zoom + 1)));
}

export function pulsePhase(time: number, period: number): number {
  if (period <= 0) return 0;
  return (time % period) / period;
}
