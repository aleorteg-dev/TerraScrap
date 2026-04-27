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

  it('T-07 calls apiClient.getTilesChunk for initial viewport', async () => {
    const apiClient = makeApiClient();
    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} />);
    await waitFor(() => {
      expect(apiClient.getTilesChunk).toHaveBeenCalledWith('w1', 0, 0, 128);
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
    // Initial: zoom=2, pan=(0,0), getBoundingClientRect returns zeros in jsdom
    // screenToWorld(100, 200, {panX:0, panY:0, zoom:2}) → {x:50, y:100}
    fireEvent.click(canvas, { clientX: 100, clientY: 200 });
    expect(onTileClick).toHaveBeenCalledWith({ x: 50, y: 100 });
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
