import { useRef, useEffect, useCallback, type FC } from 'react';
import type { WorldMetadata, TilesChunk, ApiClient } from '../api-client';
import {
  type ViewState,
  screenToWorld,
  worldToScreen,
  clampZoom,
  zoomAroundCursor,
  visibleChunks,
} from './viewport';
import { decodeBase64RleV1, decodeBase64RleV2 } from './rleDecoder';
import {
  createChunkBitmapCache,
  renderChunkBitmap,
  renderChunkBitmapV2,
  type ChunkBitmapCache,
  type RenderedChunk,
} from './chunkBitmapCache';
import { computeChunkDimensions } from './chunkDimensions';

const CHUNK_SIZE = 128;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const INITIAL_ZOOM = 2;

export interface WorldCanvasHandle {
  centerOn(x: number, y: number): void;
  setZoom(level: number): void;
  zoomToFit(): number | null;
  redraw(): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { px: number; py: number };
  exportToPng(): Promise<Blob>;
}

export interface WorldCanvasProps {
  worldId: string;
  metadata: WorldMetadata;
  apiClient: ApiClient;
  onReady?: (handle: WorldCanvasHandle) => void;
  onTileClick?: (tile: { x: number; y: number }) => void;
  onTileSelected?: (tile: { x: number; y: number }) => void;
  onError?: (err: Error) => void;
  showLayerLines?: boolean;
  showSpawnPoint?: boolean;
  showWalls?: boolean;
  showLiquids?: boolean;
  showWires?: boolean;
}

export const WorldCanvas: FC<WorldCanvasProps> = ({
  worldId,
  metadata,
  apiClient,
  onReady,
  onTileClick,
  onTileSelected,
  onError,
  showLayerLines = false,
  showSpawnPoint = true,
  showWalls = true,
  showLiquids = true,
  showWires = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, zoom: INITIAL_ZOOM });
  const viewInitializedRef = useRef(false);
  const bitmapCacheRef = useRef<ChunkBitmapCache>(createChunkBitmapCache());
  const pendingRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Prop mirrors — updated post-render so callbacks never capture stale closures.
  const metadataRef = useRef(metadata);
  const worldIdRef = useRef(worldId);
  const apiClientRef = useRef<ApiClient>(apiClient);
  const onTileClickRef = useRef(onTileClick);
  const onTileSelectedRef = useRef(onTileSelected);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const showLayerLinesRef = useRef(showLayerLines);
  const showSpawnPointRef = useRef(showSpawnPoint);
  const showWallsRef = useRef(showWalls);
  const showLiquidsRef = useRef(showLiquids);
  const showWiresRef = useRef(showWires);

  useEffect(() => {
    metadataRef.current = metadata;
    worldIdRef.current = worldId;
    apiClientRef.current = apiClient;
    onTileClickRef.current = onTileClick;
    onTileSelectedRef.current = onTileSelected;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
    showLayerLinesRef.current = showLayerLines;
    showSpawnPointRef.current = showSpawnPoint;
    showWallsRef.current = showWalls;
    showLiquidsRef.current = showLiquids;
    showWiresRef.current = showWires;
  });

  // ─── Core render loop ────────────────────────────────────────────────────────

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const view = viewRef.current;
      const meta = metadataRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const chunks = visibleChunks(
        view,
        canvas.width,
        canvas.height,
        meta.width,
        meta.height,
        CHUNK_SIZE
      );

      for (const { cx, cy } of chunks) {
        const rendered = bitmapCacheRef.current.get(worldIdRef.current, cx, cy);
        if (!rendered) continue;
        const dimensions = computeChunkDimensions(cx, cy, CHUNK_SIZE, meta.width, meta.height);
        const pixelX = Math.round((cx * CHUNK_SIZE - view.panX) * view.zoom);
        const pixelY = Math.round((cy * CHUNK_SIZE - view.panY) * view.zoom);
        const pixelWidth = Math.ceil(dimensions.w * view.zoom);
        const pixelHeight = Math.ceil(dimensions.h * view.zoom);
        ctx.drawImage(rendered.canvas, pixelX, pixelY, pixelWidth, pixelHeight);
      }

      // Optional layer lines (surface / rock / hell)
      if (showLayerLinesRef.current) {
        const lines = [
          { y: meta.world_surface_y, color: '#44aa44' },
          { y: meta.rock_layer_y, color: '#aa8844' },
          { y: meta.hell_layer_y, color: '#cc4444' },
        ] as const;
        for (const line of lines) {
          const screenY = Math.round((line.y - view.panY) * view.zoom);
          if (screenY >= 0 && screenY < canvas.height) {
            ctx.fillStyle = line.color;
            ctx.fillRect(0, screenY, canvas.width, 1);
          }
        }
      }

      // Spawn point marker
      if (showSpawnPointRef.current) {
        const spawn = worldToScreen(meta.spawn_x, meta.spawn_y, view);
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(Math.round(spawn.px) - 3, Math.round(spawn.py) - 3, 7, 7);
      }
    });
  }, []); // stable: all deps are refs

  // ─── Chunk loading ────────────────────────────────────────────────────────────

  const loadChunk = useCallback(
    (cx: number, cy: number) => {
      const key = `${cx}:${cy}`;
      const hasBitmap = bitmapCacheRef.current.get(worldIdRef.current, cx, cy) !== undefined;
      if (hasBitmap || pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      apiClientRef.current
        .getTilesChunk(worldIdRef.current, cx, cy, CHUNK_SIZE, 'base64-rle-v2')
        .then((chunk: TilesChunk) => {
          const meta = metadataRef.current;
          let rendered: RenderedChunk;
          if (chunk.encoding === 'base64-rle-v2') {
            const decoded = decodeBase64RleV2(chunk.payload, chunk.width, chunk.height);
            rendered = renderChunkBitmapV2(
              worldIdRef.current,
              cx,
              cy,
              decoded,
              CHUNK_SIZE,
              meta.width,
              meta.height,
              {
                showWalls: showWallsRef.current,
                showLiquids: showLiquidsRef.current,
                showWires: showWiresRef.current,
              }
            );
          } else {
            const tiles = decodeBase64RleV1(chunk.payload, chunk.width, chunk.height);
            rendered = renderChunkBitmap(
              worldIdRef.current,
              cx,
              cy,
              tiles,
              CHUNK_SIZE,
              meta.width,
              meta.height
            );
          }
          bitmapCacheRef.current.set(rendered);
          pendingRef.current.delete(key);
          scheduleRedraw();
        })
        .catch((err: unknown) => {
          pendingRef.current.delete(key);
          const error = err instanceof Error ? err : new Error('Chunk load failed');
          onErrorRef.current?.(error);
        });
    },
    [scheduleRedraw]
  );

  const loadVisibleChunks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;
    const meta = metadataRef.current;
    const chunks = visibleChunks(
      view,
      canvas.width,
      canvas.height,
      meta.width,
      meta.height,
      CHUNK_SIZE
    );
    for (const { cx, cy } of chunks) {
      loadChunk(cx, cy);
    }
  }, [loadChunk]);

  // ─── worldId change: clear stale caches and reload ───────────────────────────

  const prevWorldIdRef = useRef(worldId);
  useEffect(() => {
    const prevId = prevWorldIdRef.current;
    if (prevId !== worldId) {
      bitmapCacheRef.current.clearWorld(prevId);
      pendingRef.current.clear();
      prevWorldIdRef.current = worldId;
      loadVisibleChunks();
      scheduleRedraw();
    }
  }, [worldId, loadVisibleChunks, scheduleRedraw]);

  useEffect(() => {
    bitmapCacheRef.current.clearWorld(worldId);
    pendingRef.current.clear();
    loadVisibleChunks();
    scheduleRedraw();
  }, [worldId, showWalls, showLiquids, showWires, loadVisibleChunks, scheduleRedraw]);

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  // ResizeObserver: keep canvas sized to its container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = entry.contentRect.width;
      canvas.height = entry.contentRect.height;
      if (!viewInitializedRef.current) {
        viewInitializedRef.current = true;
        const meta = metadataRef.current;
        const zoom = INITIAL_ZOOM;
        // Center on spawn point
        viewRef.current = {
          zoom,
          panX: meta.spawn_x - canvas.width / (2 * zoom),
          panY: meta.spawn_y - canvas.height / (2 * zoom),
        };
      }
      loadVisibleChunks();
      scheduleRedraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [loadVisibleChunks, scheduleRedraw]);

  // Emit imperative handle once on mount
  useEffect(() => {
    if (!onReadyRef.current) return;
    const handle: WorldCanvasHandle = {
      centerOn(x: number, y: number) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        viewRef.current = {
          ...viewRef.current,
          panX: x - canvas.width / (2 * viewRef.current.zoom),
          panY: y - canvas.height / (2 * viewRef.current.zoom),
        };
        loadVisibleChunks();
        scheduleRedraw();
      },
      setZoom(level: number) {
        const canvas = canvasRef.current;
        const clamped = clampZoom(level, MIN_ZOOM, MAX_ZOOM);
        if (canvas) {
          viewRef.current = zoomAroundCursor(
            canvas.width / 2,
            canvas.height / 2,
            clamped,
            viewRef.current
          );
        } else {
          viewRef.current = { ...viewRef.current, zoom: clamped };
        }
        loadVisibleChunks();
        scheduleRedraw();
      },
      zoomToFit(): number | null {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const meta = metadataRef.current;
        const nextZoom = clampZoom(
          Math.min(canvas.width / meta.width, canvas.height / meta.height),
          MIN_ZOOM,
          MAX_ZOOM
        );
        viewRef.current = {
          zoom: nextZoom,
          panX: meta.width / 2 - canvas.width / (2 * nextZoom),
          panY: meta.height / 2 - canvas.height / (2 * nextZoom),
        };
        loadVisibleChunks();
        scheduleRedraw();
        return nextZoom;
      },
      redraw: scheduleRedraw,
      screenToWorld: (px: number, py: number) => screenToWorld(px, py, viewRef.current),
      worldToScreen: (x: number, y: number) => worldToScreen(x, y, viewRef.current),
      exportToPng(): Promise<Blob> {
        return new Promise((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            reject(new Error('Canvas not mounted'));
            return;
          }
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob returned null'));
          }, 'image/png');
        });
      },
    };
    onReadyRef.current(handle);
  }, [scheduleRedraw, loadVisibleChunks]);

  // Non-passive wheel listener (must call preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorPx = e.clientX - rect.left;
      const cursorPy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const newZoom = clampZoom(viewRef.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      viewRef.current = zoomAroundCursor(cursorPx, cursorPy, newZoom, viewRef.current);
      loadVisibleChunks();
      scheduleRedraw();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [loadVisibleChunks, scheduleRedraw]);

  // ─── Mouse event handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const view = viewRef.current;
      viewRef.current = {
        ...view,
        panX: view.panX - dx / view.zoom,
        panY: view.panY - dy / view.zoom,
      };
      loadVisibleChunks();
      scheduleRedraw();
    },
    [loadVisibleChunks, scheduleRedraw]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const world = screenToWorld(px, py, viewRef.current);
    const tile = {
      x: Math.floor(world.x),
      y: Math.floor(world.y),
    };
    onTileClickRef.current?.(tile);
    onTileSelectedRef.current?.(tile);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        data-testid="world-canvas"
        style={{ cursor: 'grab', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  );
};
