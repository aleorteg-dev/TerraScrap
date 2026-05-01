import { useRef, useEffect, useCallback, type FC } from 'react';
import type { WorldMetadata, TilesChunk, ApiClient } from './types';
import {
  type ViewState,
  screenToWorld,
  worldToScreen,
  clampZoom,
  zoomAroundCursor,
  visibleChunks,
} from './viewport';
import { decodeBase64RleV1 } from './rleDecoder';
import {
  createChunkBitmapCache,
  renderChunkBitmap,
  type ChunkBitmapCache,
} from './chunkBitmapCache';
import { computeChunkDimensions } from './chunkDimensions';

const CHUNK_SIZE = 128;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
const INITIAL_ZOOM = 2;

export interface WorldCanvasHandle {
  centerOn(x: number, y: number): void;
  setZoom(level: number): void;
  redraw(): void;
  screenToWorld(px: number, py: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { px: number; py: number };
}

export interface WorldCanvasProps {
  worldId: string;
  metadata: WorldMetadata;
  apiClient: ApiClient;
  onReady?: (handle: WorldCanvasHandle) => void;
  onTileClick?: (tile: { x: number; y: number }) => void;
}

export const WorldCanvas: FC<WorldCanvasProps> = ({
  worldId,
  metadata,
  apiClient,
  onReady,
  onTileClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable render state — kept in refs to avoid re-renders on every frame
  // panX/panY are initialized in ResizeObserver (first fire) once canvas dims are known.
  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, zoom: INITIAL_ZOOM });
  const viewInitializedRef = useRef(false);
  const chunkCacheRef = useRef(new Map<string, Int16Array>());
  const bitmapCacheRef = useRef<ChunkBitmapCache>(createChunkBitmapCache());
  const pendingRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Prop mirrors — stable refs so callbacks never capture stale closures.
  // Updated via a post-render effect (setting .current during render is forbidden
  // by react-hooks/refs; effects run after render, before any RAF or event handler).
  const metadataRef = useRef(metadata);
  const worldIdRef = useRef(worldId);
  const apiClientRef = useRef<ApiClient>(apiClient);
  const onTileClickRef = useRef(onTileClick);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    metadataRef.current = metadata;
    worldIdRef.current = worldId;
    apiClientRef.current = apiClient;
    onTileClickRef.current = onTileClick;
    onReadyRef.current = onReady;
  }); // no dep array → runs after every render

  // ─── Core render loop ────────────────────────────────────────────────────

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
    });
  }, []); // stable: all deps are refs

  // ─── Chunk loading ────────────────────────────────────────────────────────

  const loadChunk = useCallback(
    (cx: number, cy: number) => {
      const key = `${cx}:${cy}`;
      if (chunkCacheRef.current.has(key) || pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      apiClientRef.current
        .getTilesChunk(worldIdRef.current, cx, cy, CHUNK_SIZE)
        .then((chunk: TilesChunk) => {
          const tiles = decodeBase64RleV1(chunk.payload, chunk.width, chunk.height);
          chunkCacheRef.current.set(key, tiles);
          const meta = metadataRef.current;
          const rendered = renderChunkBitmap(
            worldIdRef.current,
            cx,
            cy,
            tiles,
            CHUNK_SIZE,
            meta.width,
            meta.height
          );
          bitmapCacheRef.current.set(rendered);
          pendingRef.current.delete(key);
          scheduleRedraw();
        })
        .catch(() => {
          pendingRef.current.delete(key);
        });
    },
    [scheduleRedraw]
  ); // stable because scheduleRedraw is stable

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
  }, [loadChunk]); // stable

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadVisibleChunks();
    scheduleRedraw();
  }, [loadVisibleChunks, scheduleRedraw]);

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
        // Center on horizontal midpoint, vertical ~20% depth (approximate surface).
        const centerX = meta.width / 2;
        const centerY = Math.floor(meta.height / 5);
        viewRef.current = {
          zoom,
          panX: centerX - canvas.width / (2 * zoom),
          panY: centerY - canvas.height / (2 * zoom),
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
      redraw: scheduleRedraw,
      screenToWorld: (px: number, py: number) => screenToWorld(px, py, viewRef.current),
      worldToScreen: (x: number, y: number) => worldToScreen(x, y, viewRef.current),
    };
    onReadyRef.current(handle);
  }, [scheduleRedraw, loadVisibleChunks]); // stable → fires once

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

  // ─── Mouse event handlers ─────────────────────────────────────────────────

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
    if (!onTileClickRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const world = screenToWorld(px, py, viewRef.current);
    onTileClickRef.current({
      x: Math.floor(world.x),
      y: Math.floor(world.y),
    });
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
