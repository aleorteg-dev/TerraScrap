import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorldCanvas, type WorldCanvasHandle } from '../WorldCanvas';
import type { WorldMetadata, ApiClient, TilesChunk } from '../../api-client';

const mockMeta: WorldMetadata = {
  name: 'Test World',
  width: 4200,
  height: 1200,
  version: 279,
  seed: '12345',
  size: 'medium',
  hardmode: false,
  spawn_x: 2100,
  spawn_y: 240,
  world_surface_y: 240,
  rock_layer_y: 600,
  hell_layer_y: 1100,
};

function encodeSingleRun(tileId: number, count: number): string {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setInt16(0, tileId, true);
  view.setUint16(2, count, true);
  return btoa(String.fromCharCode(...bytes));
}

function makeEmptyChunk(cx = 0, cy = 0, width = 128, height = 128): TilesChunk {
  return {
    chunk_x: cx,
    chunk_y: cy,
    width,
    height,
    encoding: 'base64-rle-v1',
    payload: encodeSingleRun(-1, width * height),
  };
}

function makeApiClient(): ApiClient {
  return {
    getTilesChunk: vi.fn().mockResolvedValue(makeEmptyChunk()),
  } as unknown as ApiClient;
}

function makeApiClientForMetadata(metadata: WorldMetadata): ApiClient {
  return {
    getTilesChunk: vi.fn(
      (_worldId: string, cx: number, cy: number, chunkSize = 128): Promise<TilesChunk> => {
        const width = Math.max(0, Math.min(chunkSize, metadata.width - cx * chunkSize));
        const height = Math.max(0, Math.min(chunkSize, metadata.height - cy * chunkSize));
        return Promise.resolve(makeEmptyChunk(cx, cy, width, height));
      }
    ),
  } as unknown as ApiClient;
}

function getDrawImageContexts(): Array<{ drawImage: ReturnType<typeof vi.fn> }> {
  const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
  return mockCtxGet.mock.results.map(
    (result) => result.value as { drawImage: ReturnType<typeof vi.fn> }
  );
}

function hasDrawImageCall(
  ctx: { drawImage: ReturnType<typeof vi.fn> },
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number
): boolean {
  const calls = ctx.drawImage.mock.calls as ReadonlyArray<readonly unknown[]>;
  return calls.some((call) => {
    const source = call[0];
    const actualDestinationWidth = call[3];
    const actualDestinationHeight = call[4];
    return (
      source instanceof HTMLCanvasElement &&
      source.width === sourceWidth &&
      source.height === sourceHeight &&
      actualDestinationWidth === destinationWidth &&
      actualDestinationHeight === destinationHeight
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    // world: 4200 by 1200, canvas: 800 by 600, zoom: 2
    // center: (2100, 240), pan: (1900, 90)
    // first visible chunk: cx=floor(1900/128)=14, cy=floor(90/128)=0
    await waitFor(() => {
      expect(apiClient.getTilesChunk).toHaveBeenCalledWith('w1', 14, 0, 128, 'base64-rle-v2');
    });
  });

  it('T-08 panning updates state and triggers redraw', () => {
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
    // world: 4200 by 1200, canvas: 800 by 600, zoom: 2
    // panX = 2100 - 800/(2*2) = 1900, panY = 240 - 600/(2*2) = 90
    // screenToWorld(100, 200, {panX:1900, panY:90, zoom:2}) = {x:1950, y:190}
    fireEvent.click(canvas, { clientX: 100, clientY: 200 });
    expect(onTileClick).toHaveBeenCalledWith({ x: 1950, y: 190 });
  });

  it('T-11 WorldCanvas should center viewport on world midpoint at first resize', () => {
    // world: 4200 by 1200, canvas: 800 by 600, zoom: 2
    // expected center: (2100, floor(1200/5)=240)
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as {
      worldToScreen: (x: number, y: number) => { px: number; py: number };
    };
    const { px, py } = handle.worldToScreen(2100, 240);
    expect(px).toBeCloseTo(400, 0);
    expect(py).toBeCloseTo(300, 0);
  });

  it('T-12 WorldCanvas should call ctx.drawImage when rendering a loaded chunk', async () => {
    const apiClient = makeApiClient();
    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} />);
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const ctx = mockCtxGet.mock.results[0]?.value as { drawImage: ReturnType<typeof vi.fn> };
      expect(ctx.drawImage).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });
  });

  it('does not draw the orange spawn marker by default', async () => {
    const apiClient = makeApiClient();
    const mockCtxGet = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const mainCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn() as unknown as CanvasRenderingContext2D['drawImage'],
    };
    const chunkCtx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect: vi.fn(),
    };
    mockCtxGet.mockImplementation(function (this: HTMLCanvasElement) {
      return (
        this.dataset.testid === 'world-canvas' ? mainCtx : chunkCtx
      ) as CanvasRenderingContext2D;
    });

    render(<WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} />);

    await waitFor(() => {
      expect(mainCtx.drawImage).toHaveBeenCalled();
      expect(mainCtx.fillRect).not.toHaveBeenCalled();
    });
  });

  it('T-13 WorldCanvas should draw clipped dimensions for edge chunks in a non-multiple world', async () => {
    const edgeMeta: WorldMetadata = {
      ...mockMeta,
      width: 8400,
      height: 2400,
    };
    const apiClient = makeApiClientForMetadata(edgeMeta);
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={edgeMeta} apiClient={apiClient} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as WorldCanvasHandle;

    handle.centerOn(edgeMeta.width - 1, edgeMeta.height - 1);

    await waitFor(() => {
      const contexts = getDrawImageContexts();
      expect(contexts.some((ctx) => hasDrawImageCall(ctx, 80, 128, 160, 256))).toBe(true);
      expect(contexts.some((ctx) => hasDrawImageCall(ctx, 128, 96, 256, 192))).toBe(true);
      expect(contexts.some((ctx) => hasDrawImageCall(ctx, 80, 96, 160, 192))).toBe(true);
    });
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
    expect(typeof (handle as Record<string, unknown>)['zoomToFit']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['redraw']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['screenToWorld']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['worldToScreen']).toBe('function');
    expect(typeof (handle as Record<string, unknown>)['exportToPng']).toBe('function');
  });

  it('T-14 WorldCanvas re-fetches chunks when worldId changes', async () => {
    const apiClient = makeApiClient();
    const { rerender } = render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} />
    );
    await waitFor(() => {
      expect(
        (apiClient.getTilesChunk as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[0] === 'w1')
      ).toBe(true);
    });
    (apiClient.getTilesChunk as ReturnType<typeof vi.fn>).mockClear();

    rerender(<WorldCanvas worldId="w2" metadata={mockMeta} apiClient={apiClient} />);

    await waitFor(() => {
      expect(
        (apiClient.getTilesChunk as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[0] === 'w2')
      ).toBe(true);
    });
  });

  it('T-15 setZoom clamps to minimum 0.25', () => {
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as WorldCanvasHandle;
    handle.setZoom(0.001);
    const s0 = handle.worldToScreen(0, 0);
    const s1 = handle.worldToScreen(1, 0);
    expect(s1.px - s0.px).toBeCloseTo(0.25, 2);
  });

  it('T-15b setZoom clamps to maximum 8', () => {
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as WorldCanvasHandle;
    handle.setZoom(999);
    const s0 = handle.worldToScreen(0, 0);
    const s1 = handle.worldToScreen(1, 0);
    expect(s1.px - s0.px).toBeCloseTo(8, 2);
  });

  it('T-15c zoomToFit fits the full world in the canvas', () => {
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as WorldCanvasHandle;

    const zoom = handle.zoomToFit();

    expect(zoom).toBeCloseTo(0.25, 2);
    const center = handle.worldToScreen(mockMeta.width / 2, mockMeta.height / 2);
    expect(center.px).toBeCloseTo(400, 0);
    expect(center.py).toBeCloseTo(300, 0);
  });

  it('T-16 exportToPng returns a non-empty Blob', async () => {
    const onReady = vi.fn();
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={makeApiClient()} onReady={onReady} />
    );
    const handle = onReady.mock.calls[0]?.[0] as WorldCanvasHandle;
    const blob = await handle.exportToPng();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('T-17 onTileSelected receives correct tile coordinates on click', () => {
    const onTileSelected = vi.fn();
    render(
      <WorldCanvas
        worldId="w1"
        metadata={mockMeta}
        apiClient={makeApiClient()}
        onTileSelected={onTileSelected}
      />
    );
    const canvas = screen.getByTestId('world-canvas');
    // spawn_x=2100, spawn_y=240, canvas 800×600, zoom=2
    // panX=1900, panY=90 → screenToWorld(100,200)={x:1950,y:190}
    fireEvent.click(canvas, { clientX: 100, clientY: 200 });
    expect(onTileSelected).toHaveBeenCalledWith({ x: 1950, y: 190 });
  });

  it('T-18 onError fires when getTilesChunk rejects', async () => {
    const onError = vi.fn();
    const apiClient = {
      getTilesChunk: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ApiClient;
    render(
      <WorldCanvas worldId="w1" metadata={mockMeta} apiClient={apiClient} onError={onError} />
    );
    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
  });
});
