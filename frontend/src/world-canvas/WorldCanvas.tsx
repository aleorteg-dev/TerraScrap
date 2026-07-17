import { useRef, useEffect, useCallback, type FC } from 'react';
import type { WorldMetadata, TilesChunk, ApiClient } from '../api-client';
import {
  type ViewState,
  ZOOM_LIMITS,
  screenToWorld,
  worldToScreen,
  clampZoom,
  zoomAroundCursor,
  visibleChunks,
  chunkSizeForZoom,
} from './viewport';
import { decodeBase64RleV1AsV2, decodeBase64RleV2, type DecodedChunkV2 } from './rleDecoder';
import {
  createChunkBitmapCache,
  renderChunkBitmapV2,
  type ChunkBitmapCache,
} from './chunkBitmapCache';
import { computeChunkDimensions } from './chunkDimensions';
import { createLruCache } from './lruCache';

// Tope de chunks decodificados retenidos (IT-08, E09/P07): permite
// re-rasterizar al togglear capas sin volver a la red, con memoria acotada.
const DECODED_CACHE_MAX_ENTRIES = 128;

// Chunk decodificado + surface_y por columna del backend, necesario para
// repintar el backdrop al re-rasterizar sin red.
interface DecodedChunkEntry {
  data: DecodedChunkV2;
  surfaceY?: readonly number[];
}

// Un click precedido de un drag con más de este desplazamiento acumulado (px)
// no selecciona tile: terminar un pan no es una selección (IT-07, E07).
const CLICK_DRAG_THRESHOLD_PX = 5;

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
  onZoomChange?: (zoom: number) => void;
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
  onZoomChange,
  onError,
  showLayerLines = false,
  showSpawnPoint = false,
  showWalls = true,
  showLiquids = true,
  showWires = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, zoom: ZOOM_LIMITS.initial });
  const viewInitializedRef = useRef(false);
  const bitmapCacheRef = useRef<ChunkBitmapCache>(createChunkBitmapCache());
  const decodedCacheRef = useRef(createLruCache<DecodedChunkEntry>(DECODED_CACHE_MAX_ENTRIES));
  const pendingRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);

  // Prop mirrors — updated post-render so callbacks never capture stale closures.
  const metadataRef = useRef(metadata);
  const worldIdRef = useRef(worldId);
  const apiClientRef = useRef<ApiClient>(apiClient);
  const onTileClickRef = useRef(onTileClick);
  const onTileSelectedRef = useRef(onTileSelected);
  const onZoomChangeRef = useRef(onZoomChange);
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
    onZoomChangeRef.current = onZoomChange;
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

      const chunkSize = chunkSizeForZoom(view.zoom);
      const chunks = visibleChunks(
        view,
        canvas.width,
        canvas.height,
        meta.width,
        meta.height,
        chunkSize
      );

      for (const { cx, cy } of chunks) {
        const rendered = bitmapCacheRef.current.get(worldIdRef.current, chunkSize, cx, cy);
        if (!rendered) continue;
        const dimensions = computeChunkDimensions(cx, cy, chunkSize, meta.width, meta.height);
        const pixelX = Math.round((cx * chunkSize - view.panX) * view.zoom);
        const pixelY = Math.round((cy * chunkSize - view.panY) * view.zoom);
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
    (cx: number, cy: number, chunkSize: number) => {
      // worldId y metadata se capturan al lanzar la petición: si el mundo
      // cambia con el fetch en vuelo, el resultado se archiva bajo el mundo
      // antiguo (ya purgado) en vez de contaminar el nuevo.
      const wid = worldIdRef.current;
      const meta = metadataRef.current;
      const key = `${wid}:${chunkSize}:${cx}:${cy}`;
      if (bitmapCacheRef.current.get(wid, chunkSize, cx, cy) !== undefined) return;

      const rasterize = (entry: DecodedChunkEntry): void => {
        bitmapCacheRef.current.set(
          renderChunkBitmapV2(
            wid,
            cx,
            cy,
            entry.data,
            chunkSize,
            meta.width,
            meta.height,
            meta.world_surface_y,
            meta.rock_layer_y,
            meta.hell_layer_y,
            {
              showWalls: showWallsRef.current,
              showLiquids: showLiquidsRef.current,
              showWires: showWiresRef.current,
            },
            entry.surfaceY
          )
        );
      };

      // Camino local (E09): si el chunk ya está decodificado, re-rasterizar
      // sin tocar la red (p. ej. tras togglear una capa).
      const cachedEntry = decodedCacheRef.current.get(key);
      if (cachedEntry !== undefined) {
        rasterize(cachedEntry);
        scheduleRedraw();
        return;
      }

      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      apiClientRef.current
        .getTilesChunk(wid, cx, cy, chunkSize, 'base64-rle-v2')
        .then((chunk: TilesChunk) => {
          const data =
            chunk.encoding === 'base64-rle-v2'
              ? decodeBase64RleV2(chunk.payload, chunk.width, chunk.height)
              : decodeBase64RleV1AsV2(chunk.payload, chunk.width, chunk.height);
          const entry: DecodedChunkEntry = { data, surfaceY: chunk.surface_y ?? undefined };
          decodedCacheRef.current.set(key, entry);
          rasterize(entry);
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
    const chunkSize = chunkSizeForZoom(view.zoom);
    const chunks = visibleChunks(
      view,
      canvas.width,
      canvas.height,
      meta.width,
      meta.height,
      chunkSize
    );
    for (const { cx, cy } of chunks) {
      loadChunk(cx, cy, chunkSize);
    }
  }, [loadChunk]);

  // ─── worldId change: único camino de recarga (E08) ───────────────────────────
  // La carga inicial la dispara el ResizeObserver al dimensionar el canvas;
  // aquí solo se reacciona a un cambio real de mundo, purgando las cachés del
  // anterior sin vaciar pendingRef con fetches del nuevo mundo en vuelo.

  const prevWorldIdRef = useRef(worldId);
  useEffect(() => {
    const prevId = prevWorldIdRef.current;
    if (prevId === worldId) return;
    prevWorldIdRef.current = worldId;
    bitmapCacheRef.current.clearWorld(prevId);
    decodedCacheRef.current.clearPrefix(`${prevId}:`);
    pendingRef.current.clear();
    loadVisibleChunks();
    scheduleRedraw();
  }, [worldId, loadVisibleChunks, scheduleRedraw]);

  // ─── Layer toggles: re-rasterizar desde la caché decodificada (E09) ──────────

  const layersInitializedRef = useRef(false);
  useEffect(() => {
    if (!layersInitializedRef.current) {
      layersInitializedRef.current = true;
      return;
    }
    bitmapCacheRef.current.clearWorld(worldIdRef.current);
    loadVisibleChunks();
    scheduleRedraw();
  }, [showWalls, showLiquids, showWires, loadVisibleChunks, scheduleRedraw]);

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
        const zoom = ZOOM_LIMITS.initial;
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
        const clamped = clampZoom(level, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
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
        onZoomChangeRef.current?.(viewRef.current.zoom);
      },
      zoomToFit(): number | null {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const meta = metadataRef.current;
        // Sin clamp inferior: un mundo large puede necesitar un zoom < min
        // para caber entero en el viewport (E15). Solo se limita el máximo.
        const nextZoom = Math.min(
          Math.min(canvas.width / meta.width, canvas.height / meta.height),
          ZOOM_LIMITS.max
        );
        viewRef.current = {
          zoom: nextZoom,
          panX: meta.width / 2 - canvas.width / (2 * nextZoom),
          panY: meta.height / 2 - canvas.height / (2 * nextZoom),
        };
        loadVisibleChunks();
        scheduleRedraw();
        onZoomChangeRef.current?.(nextZoom);
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
      const newZoom = clampZoom(viewRef.current.zoom * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
      viewRef.current = zoomAroundCursor(cursorPx, cursorPy, newZoom, viewRef.current);
      loadVisibleChunks();
      scheduleRedraw();
      onZoomChangeRef.current?.(viewRef.current.zoom);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [loadVisibleChunks, scheduleRedraw]);

  // ─── Mouse event handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
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
    // El click que cierra un pan no es una selección (E07).
    if (dragDistanceRef.current > CLICK_DRAG_THRESHOLD_PX) return;
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
