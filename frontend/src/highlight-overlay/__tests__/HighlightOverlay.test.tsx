import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { computeHaloRadius, pulsePhase } from '../math';
import { HighlightOverlay } from '../HighlightOverlay';
import { DEFAULT_SOURCE_COLORS, resolveMatchColor } from '../math';
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
  fillRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  globalCompositeOperation: string;
};

function makeMockCtx(): MockCtx {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
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

describe('resolveMatchColor', () => {
  it('T-10a block maps to amarillo by default', () => {
    expect(resolveMatchColor('block', undefined, '#fff')).toBe(DEFAULT_SOURCE_COLORS['block']);
  });

  it('T-10b wall maps to cian by default', () => {
    expect(resolveMatchColor('wall', undefined, '#fff')).toBe(DEFAULT_SOURCE_COLORS['wall']);
  });

  it('T-10c chest maps to naranja by default', () => {
    expect(resolveMatchColor('chest', undefined, '#fff')).toBe(DEFAULT_SOURCE_COLORS['chest']);
  });

  it('T-10d object maps to magenta by default', () => {
    expect(resolveMatchColor('object', undefined, '#fff')).toBe(DEFAULT_SOURCE_COLORS['object']);
  });

  it('T-10e all four sources have distinct default colors', () => {
    const sources = ['block', 'wall', 'chest', 'object'] as const;
    const colors = sources.map((s) => resolveMatchColor(s, undefined, '#fff'));
    const unique = new Set(colors);
    expect(unique.size).toBe(4);
  });

  it('T-10f colorBySource overrides default', () => {
    expect(resolveMatchColor('chest', { chest: '#00ff00' }, '#fff')).toBe('#00ff00');
  });

  it('T-10g unknown source falls back to prop', () => {
    expect(resolveMatchColor('unknown_source', undefined, '#aabbcc')).toBe('#aabbcc');
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

  // ── New tests (iter-17) ─────────────────────────────────────────────────────

  it('T-08 viewport zoom=2 draws highlights at viewport-computed coords', () => {
    // handle.worldToScreen returns garbage — should NOT be used when viewport provided
    const handle = makeHandle(() => ({ px: 999, py: 999 }));
    const viewport = { zoom: 2, panX: 0, panY: 0 };
    render(
      <HighlightOverlay canvasHandle={handle} matches={[makeMatch(5, 8)]} viewport={viewport} />
    );
    // tileToScreen(5, 8, 2, 0, 0) => {px: 10, py: 16}
    expect(mockCtx.arc).toHaveBeenCalledWith(10, 16, expect.any(Number), 0, Math.PI * 2);
  });

  it('T-09 mask mode sets globalCompositeOperation to destination-out', () => {
    const assigned: string[] = [];
    Object.defineProperty(mockCtx, 'globalCompositeOperation', {
      get: () => assigned[assigned.length - 1] ?? 'source-over',
      set: (v: string) => {
        assigned.push(v);
      },
      configurable: true,
    });

    render(
      <HighlightOverlay canvasHandle={makeHandle()} matches={[makeMatch(1, 1)]} style="mask" />
    );
    expect(assigned).toContain('destination-out');
  });

  it('T-09b mask mode dark overlay uses fillRect for entire canvas', () => {
    render(
      <HighlightOverlay canvasHandle={makeHandle()} matches={[makeMatch(1, 1)]} style="mask" />
    );
    // First fillRect call is the dark overlay (0,0,w,h)
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  it('T-11 selectedTile draws animated border with strokeRect', () => {
    render(
      <HighlightOverlay canvasHandle={makeHandle()} matches={[]} selectedTile={{ x: 3, y: 4 }} />
    );
    // Default handle: worldToScreen(3,4) = {px:6, py:8}
    // zoom derived: worldToScreen(1,0).px - worldToScreen(0,0).px = 2 - 0 = 2
    // strokeRect(6, 8, 2, 2)
    expect(mockCtx.strokeRect).toHaveBeenCalledWith(6, 8, 2, 2);
  });

  it('T-11b selectedTile with viewport uses viewport coords', () => {
    const handle = makeHandle(() => ({ px: 999, py: 999 }));
    const viewport = { zoom: 4, panX: 10, panY: 20 };
    render(
      <HighlightOverlay
        canvasHandle={handle}
        matches={[]}
        selectedTile={{ x: 2, y: 3 }}
        viewport={viewport}
      />
    );
    // tileToScreen(2, 3, 4, 10, 20) = {px: 18, py: 32}
    expect(mockCtx.strokeRect).toHaveBeenCalledWith(18, 32, 4, 4);
  });

  it('T-11c null selectedTile draws nothing when matches empty', () => {
    render(<HighlightOverlay canvasHandle={makeHandle()} matches={[]} selectedTile={null} />);
    expect(mockCtx.strokeRect).not.toHaveBeenCalled();
  });
});
