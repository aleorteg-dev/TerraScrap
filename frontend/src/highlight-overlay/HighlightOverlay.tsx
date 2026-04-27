import { useRef, useEffect, type FC } from 'react';
import type { WorldCanvasHandle } from '../world-canvas/index';
import type { SearchMatch } from '../api-client/index';
import { computeHaloRadius, pulsePhase } from './math';

export interface HighlightOverlayProps {
  canvasHandle: WorldCanvasHandle | null;
  matches: SearchMatch[];
  style?: 'pulse' | 'outline' | 'ping';
  color?: string;
}

const HALO_PERIOD = 1500;
const OUTLINE_THRESHOLD = 500;

function getZoom(handle: WorldCanvasHandle): number {
  const a = handle.worldToScreen(0, 0);
  const b = handle.worldToScreen(1, 0);
  return b.px - a.px;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m) {
    const r = parseInt(m[1] ?? '0', 16);
    const g = parseInt(m[2] ?? '0', 16);
    const b = parseInt(m[3] ?? '0', 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
  return hex;
}

function drawMatch(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  source: SearchMatch['source'],
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

export const HighlightOverlay: FC<HighlightOverlayProps> = ({
  canvasHandle,
  matches,
  style = 'pulse',
  color = '#FFEB3B',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasHandle) return;

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

      if (matches.length > 0) {
        const zoom = getZoom(canvasHandle);
        const haloR = computeHaloRadius(zoom);
        const phase = pulsePhase(timestamp, HALO_PERIOD);
        const effectiveStyle: 'pulse' | 'outline' | 'ping' =
          matches.length > OUTLINE_THRESHOLD ? 'outline' : style;

        for (const match of matches) {
          const { px, py } = canvasHandle.worldToScreen(match.x, match.y);
          drawMatch(ctx, px, py, match.source, haloR, phase, color, effectiveStyle);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [canvasHandle, matches, style, color]);

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
