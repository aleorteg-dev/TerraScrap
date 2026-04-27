import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { computeHaloRadius, pulsePhase } from '../math';
import { HighlightOverlay } from '../HighlightOverlay';
import type { WorldCanvasHandle } from '../../world-canvas/index';
import type { SearchMatch } from '../../api-client/index';

// ── Rich canvas mock ──────────────────────────────────────────────────────────

type MockCtx = {
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
};

function makeMockCtx(): MockCtx {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeHandle(
  worldToScreen?: (x: number, y: number) => { px: number; py: number }
): WorldCanvasHandle {
  return {
    centerOn: vi.fn(),
    setZoom: vi.fn(),
    redraw: vi.fn(),
    screenToWorld: vi.fn(),
    worldToScreen: worldToScreen ?? ((x, y) => ({ px: x * 2, py: y * 2 })),
  };
}

function makeMatch(x: number, y: number, source: SearchMatch['source'] = 'block'): SearchMatch {
  return { x, y, source };
}

// ── Pure function tests ───────────────────────────────────────────────────────

describe('computeHaloRadius', () => {
  it('T-01 scales with zoom', () => {
    const r1 = computeHaloRadius(1);
    const r2 = computeHaloRadius(10);
    expect(r2).toBeGreaterThan(r1);
    expect(r1).toBeGreaterThanOrEqual(6);
    expect(r2).toBeLessThanOrEqual(24);
  });
});

describe('pulsePhase', () => {
  it('T-02 wraps over time period', () => {
    expect(pulsePhase(0, 1000)).toBe(0);
    expect(pulsePhase(500, 1000)).toBeCloseTo(0.5);
    expect(pulsePhase(1000, 1000)).toBe(0);
    expect(pulsePhase(1500, 1000)).toBeCloseTo(0.5);
  });
});

// ── Component tests ───────────────────────────────────────────────────────────

describe('HighlightOverlay', () => {
  let mockCtx: MockCtx;
  let cancelRaf: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(
        mockCtx as unknown as CanvasRenderingContext2D
      ) as typeof HTMLCanvasElement.prototype.getContext;

    let rafCount = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCount++;
      if (rafCount <= 1) cb(0);
      return rafCount;
    });
    cancelRaf = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelRaf);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T-03 renders no strokes when matches is empty', () => {
    render(<HighlightOverlay canvasHandle={makeHandle()} matches={[]} />);
    expect(mockCtx.arc).not.toHaveBeenCalled();
    expect(mockCtx.strokeRect).not.toHaveBeenCalled();
  });

  it('T-04 draws one halo per match at correct screen coords', () => {
    const handle = makeHandle((x, y) => ({ px: x * 10, py: y * 10 }));
    render(<HighlightOverlay canvasHandle={handle} matches={[makeMatch(5, 8)]} />);
    expect(mockCtx.arc).toHaveBeenCalledTimes(1);
    expect(mockCtx.arc).toHaveBeenCalledWith(50, 80, expect.any(Number), 0, Math.PI * 2);
  });

  it('T-05 degrades to outline style when matches > 500', () => {
    const matches = Array.from({ length: 501 }, (_, i) => makeMatch(i, 0));
    render(<HighlightOverlay canvasHandle={makeHandle()} matches={matches} />);
    expect(mockCtx.arc).not.toHaveBeenCalled();
    expect(mockCtx.strokeRect).toHaveBeenCalledTimes(501);
  });

  it('T-06 unmounts and stops animation frame', () => {
    const { unmount } = render(
      <HighlightOverlay canvasHandle={makeHandle()} matches={[makeMatch(0, 0)]} />
    );
    unmount();
    expect(cancelRaf).toHaveBeenCalled();
  });

  it('T-07 pointer-events is none', () => {
    render(<HighlightOverlay canvasHandle={makeHandle()} matches={[]} />);
    const canvas = screen.getByTestId('highlight-overlay');
    expect(canvas).toHaveStyle({ pointerEvents: 'none' });
  });
});
