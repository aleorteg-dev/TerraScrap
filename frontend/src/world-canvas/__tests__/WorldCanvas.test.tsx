import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorldCanvas } from '../WorldCanvas';
import type { WorldMetadata, ApiClient, TilesChunk } from '../types';

const mockMeta: WorldMetadata = {
  name: 'Test World',
  width: 4200,
  height: 1200,
  version: 279,
  seed: '12345',
  size: 'medium',
  hardmode: false,
};

function makeEmptyChunk(cx = 0, cy = 0): TilesChunk {
  return {
    chunk_x: cx,
    chunk_y: cy,
    width: 128,
    height: 128,
    encoding: 'base64-rle-v1',
    payload: '',
  };
}

function makeApiClient(): ApiClient {
  return {
    getTilesChunk: vi.fn().mockResolvedValue(makeEmptyChunk()),
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation((cb: ResizeObserverCallback) => ({
      observe: vi.fn().mockImplementation((el: Element) => {
        cb(
          [
            {
              contentRect: { width: 800, height: 600 },
              target: el,
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver
        );
      }),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorldCanvas', () => {
  it('T-06 renders canvas element with correct dimensions', () => {
    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} />);
    const canvas = screen.getByTestId('world-canvas') as HTMLCanvasElement;
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('T-07 calls apiClient.getTilesChunk for initial viewport near world center', async () => {
    const apiClient = makeApiClient();
    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} />);
    // world: 4200×1200, canvas: 800×600, zoom: 2
    // center: (2100, 240), pan: (1900, 165)
    // first visible chunk: cx=floor(1900/128)=14, cy=floor(165/128)=1
    await waitFor(() => {
      expect(apiClient.getTilesChunk).toHaveBeenCalledWith('w1', 14, 1, 128);
    });
  });

  it('T-08 panning updates state and triggers redraw', () => {
    // The mock context's clearRect acts as proxy for "redraw happened"
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} />);
    const ctx = mockCtxGet.mock.results[0]?.value as {
      clearRect: ReturnType<typeof vi.fn>;
    };
    ctx.clearRect.mockClear();

    const canvas = screen.getByTestId('world-canvas');
    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 120 });

    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it('T-09 onTileClick receives correct tile coordinates', () => {
    const onTileClick = vi.fn();
    render(
      <WorldCanvas
        worldId="w1"
        metadata={mockMeta}
        apiClient={makeApiClient()}
        onTileClick={onTileClick}
      />
    );
    const canvas = screen.getByTestId('world-canvas');
    // world: 4200×1200, canvas: 800×600, zoom: 2
    // panX = 2100 - 800/(2*2) = 1900, panY = 240 - 600/(2*2) = 90
    // getBoundingClientRect returns zeros in jsdom → click at screen (100,200)
    // screenToWorld(100, 200, {panX:1900, panY:90, zoom:2}) → {x:1950, y:190}
    fireEvent.click(canvas, { clientX: 100, clientY: 200 });
    expect(onTileClick).toHaveBeenCalledWith({ x: 1950, y: 190 });
  });

  it('T-11 WorldCanvas should center viewport on world midpoint at first resize', () => {
    // world: 4200×1200, canvas: 800×600, zoom: 2
    // expected center: (2100, floor(1200/5)=240)
    // expected pan: (1900, 90)
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as {
      worldToScreen: (x: number, y: number) => { px: number; py: number };
    };
    // World center (2100, 240) should appear near screen centre (400, 300)
    const { px, py } = handle.worldToScreen(2100, 240);
    expect(px).toBeCloseTo(400, 0);
    expect(py).toBeCloseTo(300, 0);
  });

  it('T-10 onReady emits a handle with imperative API', () => {
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    expect(onReady).toHaveBeenCalledTimes(1);
    const handle: unknown = onReady.mock.calls[0]?.[0];
    expect(handle).toBeDefined();
    expect(typeof (handle as Record<string, unknown>)['centerOn']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['setZoom']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['redraw']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['screenToWorld']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['worldToScreen']).toBe('function');
  });
});
