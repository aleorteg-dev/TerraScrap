import type { SearchMatch, WorldMetadata, TileDetail, Npc } from '../api-client';

export const INITIAL_ZOOM = 2;
export const ZOOM_STEP = 0.5;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export interface LayerState {
  walls: boolean;
  liquids: boolean;
  wires: boolean;
  grid: boolean;
}

export type AppState =
  | { kind: 'NoWorld' }
  | {
      kind: 'WorldLoaded';
      worldId: string;
      metadata: WorldMetadata;
      matches: SearchMatch[];
      selectedTile: { x: number; y: number } | null;
      tileDetail: TileDetail | null;
      npcs: Npc[] | null;
      layers: LayerState;
      maskMode: boolean;
      sidebarOpen: boolean;
      panels: { npcs: boolean; tile: boolean };
      zoom: number;
    };

export type AppAction =
  | { type: 'UPLOAD_SUCCESS'; worldId: string; metadata: WorldMetadata }
  | { type: 'SET_MATCHES'; matches: SearchMatch[] }
  | { type: 'CLOSE_WORLD' }
  | { type: 'SELECT_TILE'; x: number; y: number }
  | { type: 'CLEAR_TILE_SELECTION' }
  | { type: 'SET_TILE_DETAIL'; detail: TileDetail }
  | { type: 'SET_NPCS'; npcs: Npc[] }
  | { type: 'TOGGLE_LAYER'; layer: keyof LayerState }
  | { type: 'TOGGLE_MASK_MODE' }
  | { type: 'TOGGLE_PANEL'; panel: 'npcs' | 'tile' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_ZOOM'; zoom: number };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UPLOAD_SUCCESS':
      return {
        kind: 'WorldLoaded',
        worldId: action.worldId,
        metadata: action.metadata,
        matches: [],
        selectedTile: null,
        tileDetail: null,
        npcs: null,
        layers: { walls: true, liquids: true, wires: true, grid: false },
        maskMode: false,
        sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
        panels: { npcs: false, tile: false },
        zoom: INITIAL_ZOOM,
      };
    case 'SET_MATCHES':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, matches: action.matches };
    case 'CLOSE_WORLD':
      return { kind: 'NoWorld' };
    case 'SELECT_TILE':
      if (state.kind !== 'WorldLoaded') return state;
      return {
        ...state,
        selectedTile: { x: action.x, y: action.y },
        panels: { ...state.panels, tile: true },
      };
    case 'CLEAR_TILE_SELECTION':
      if (state.kind !== 'WorldLoaded') return state;
      return {
        ...state,
        selectedTile: null,
        tileDetail: null,
        panels: { ...state.panels, tile: false },
      };
    case 'SET_TILE_DETAIL':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, tileDetail: action.detail };
    case 'SET_NPCS':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, npcs: action.npcs };
    case 'TOGGLE_LAYER':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, layers: { ...state.layers, [action.layer]: !state.layers[action.layer] } };
    case 'TOGGLE_MASK_MODE':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, maskMode: !state.maskMode };
    case 'TOGGLE_PANEL':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, panels: { ...state.panels, [action.panel]: !state.panels[action.panel] } };
    case 'TOGGLE_SIDEBAR':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'SET_ZOOM':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, action.zoom)) };
  }
}
