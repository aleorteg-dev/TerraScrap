import { useRef, useEffect, type FC } from 'react';
import type { WorldCanvasHandle } from '../world-canvas/index';
import type { SearchMatch } from '../api-client/index';
import { computeHaloRadius, pulsePhase, resolveMatchColor, colorWithAlpha } from './math';

// ── Public types ──────────────────────────────────────────────────────────────

type Source = SearchMatch['source'];

export interface HighlightOverlayProps {
  canvasHandle: WorldCanvasHandle | null;
  matches: SearchMatch[];
  style?: 'pulse' | 'outline' | 'ping' | 'mask';
  color?: string;
  colorBySource?: Partial<Record<Source, string>>;
  selectedTile?: { x: number; y: number } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HALO_PERIOD = 1500;
const OUTLINE_THRESHOLD = 500;
const FALLBACK_COLOR = '#FFEB3B';

// ── Drawing helpers ───────────────────────────────────────────────────────────

function resolveZoom(handle: WorldCanvasHandle): number {
  const a = handle.worldToScreen(0, 0);
  const b = handle.worldToScreen(1, 0);
  return b.px - a.px;
}

function drawHaloMatch(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  source: Source,
  haloR: number,
  phase: number,
  color: string,
  effectiveStyle: 'pulse' | 'outline' | 'ping'
): void {
  if (effectiveStyle === 'outline') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px - haloR, py - haloR, haloR * 2, haloR * 2);
    return;
  }

  if (effectiveStyle === 'ping') {
    const pingR = haloR * (1 + phase * 2);
    const alpha = 1 - phase;
    ctx.beginPath();
    ctx.arc(px, py, pingR, 0, Math.PI * 2);
    ctx.strokeStyle = colorWithAlpha(color, alpha * 0.9);
    ctx.lineWidth = 3;
    ctx.stroke();
    return;
  }

  // pulse (default)
  const pulse = Math.sin(phase * Math.PI * 2);
  const r = haloR + pulse * haloR * 0.3;

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = colorWithAlpha(color, 0.35 + 0.1 * ((pulse + 1) / 2));
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = source === 'chest' ? 3 : 2;
  ctx.stroke();

  if (source === 'chest') {
    ctx.beginPath();
    ctx.arc(px, py, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(color, 0.9);
    ctx.fill();
  }
}

function drawMaskMode(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  matches: SearchMatch[],
  zoom: number,
  handle: WorldCanvasHandle,
  colorBySource: Partial<Record<string, string>> | undefined,
  fallbackColor: string,
  phase: number
): void {
  const w = canvasWidth;
  const h = canvasHeight;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(255,255,255,1)';
  for (const match of matches) {
    const { px, py } = handle.worldToScreen(match.x, match.y);
    ctx.fillRect(px, py, zoom, zoom);
  }

  ctx.globalCompositeOperation = 'source-over';
  const pulse = Math.sin(phase * Math.PI * 2);
  const alpha = 0.7 + 0.3 * ((pulse + 1) / 2);
  for (const match of matches) {
    const { px, py } = handle.worldToScreen(match.x, match.y);
    const color = resolveMatchColor(match.source, colorBySource, fallbackColor);
    ctx.strokeStyle = colorWithAlpha(color, alpha);
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, zoom, zoom);
  }
}

function drawSelectedTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  zoom: number,
  phase: number
): void {
  const pulse = Math.sin(phase * Math.PI * 2);
  const alpha = 0.6 + 0.4 * ((pulse + 1) / 2);
  ctx.strokeStyle = `rgba(255,80,80,${alpha.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, zoom, zoom);
}

// ── Component ─────────────────────────────────────────────────────────────────

export const HighlightOverlay: FC<HighlightOverlayProps> = ({
  canvasHandle,
  matches,
  style = 'pulse',
  color = FALLBACK_COLOR,
  colorBySource,
  selectedTile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasHandle) return;

    // Modo reposo (P05): sin matches ni selección no hay nada que animar.
    // Se limpia una vez y NO se arranca el bucle rAF; el efecto se
    // re-suscribe cuando cambie cualquier prop y reanuda el dibujo.
    if (matches.length === 0 && selectedTile == null) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let rafId = 0;

    const loop = (timestamp: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const phase = pulsePhase(timestamp, HALO_PERIOD);
      const zoom = resolveZoom(canvasHandle);

      if (selectedTile != null) {
        const pos = canvasHandle.worldToScreen(selectedTile.x, selectedTile.y);
        drawSelectedTile(ctx, pos.px, pos.py, zoom, phase);
      }

      if (matches.length > 0) {
        const effectiveStyle: 'pulse' | 'outline' | 'ping' | 'mask' =
          matches.length > OUTLINE_THRESHOLD && style !== 'mask' ? 'outline' : style;

        if (effectiveStyle === 'mask') {
          drawMaskMode(
            ctx,
            canvas.width,
            canvas.height,
            matches,
            zoom,
            canvasHandle,
            colorBySource,
            color,
            phase
          );
        } else {
          const haloR = computeHaloRadius(zoom);
          for (const match of matches) {
            const { px, py } = canvasHandle.worldToScreen(match.x, match.y);
            const matchColor = resolveMatchColor(match.source, colorBySource, color);
            drawHaloMatch(ctx, px, py, match.source, haloR, phase, matchColor, effectiveStyle);
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [canvasHandle, matches, style, color, colorBySource, selectedTile]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="highlight-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};
