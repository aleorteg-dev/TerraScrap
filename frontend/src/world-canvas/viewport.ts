export interface ViewState {
  panX: number; // world-tile coordinate of the viewport top-left
  panY: number;
  zoom: number; // pixels per tile
}

export function screenToWorld(px: number, py: number, view: ViewState): { x: number; y: number } {
  return {
    x: view.panX + px / view.zoom,
    y: view.panY + py / view.zoom,
  };
}

export function worldToScreen(x: number, y: number, view: ViewState): { px: number; py: number } {
  return {
    px: (x - view.panX) * view.zoom,
    py: (y - view.panY) * view.zoom,
  };
}

export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, zoom));
}

// Zoom centred on a screen pixel: the world coordinate under the cursor stays fixed.
export function zoomAroundCursor(
  cursorPx: number,
  cursorPy: number,
  newZoom: number,
  view: ViewState
): ViewState {
  const wx = view.panX + cursorPx / view.zoom;
  const wy = view.panY + cursorPy / view.zoom;
  return {
    zoom: newZoom,
    panX: wx - cursorPx / newZoom,
    panY: wy - cursorPy / newZoom,
  };
}

export function visibleChunks(
  view: ViewState,
  canvasW: number,
  canvasH: number,
  worldW: number,
  worldH: number,
  chunkSize: number
): Array<{ cx: number; cy: number }> {
  const left = Math.floor(view.panX / chunkSize);
  const top = Math.floor(view.panY / chunkSize);
  const right = Math.floor((view.panX + canvasW / view.zoom) / chunkSize);
  const bottom = Math.floor((view.panY + canvasH / view.zoom) / chunkSize);

  const maxCX = Math.ceil(worldW / chunkSize) - 1;
  const maxCY = Math.ceil(worldH / chunkSize) - 1;

  const chunks: Array<{ cx: number; cy: number }> = [];
  for (let cy = Math.max(0, top); cy <= Math.min(maxCY, bottom); cy++) {
    for (let cx = Math.max(0, left); cx <= Math.min(maxCX, right); cx++) {
      chunks.push({ cx, cy });
    }
  }
  return chunks;
}
