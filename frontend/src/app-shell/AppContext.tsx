import { createContext, useContext, type Dispatch } from 'react';
import type { WorldCanvasHandle } from '../world-canvas';
import type { AppAction, AppState } from './appState';

export interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  canvasHandle: WorldCanvasHandle | null;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) throw new Error('useAppContext must be used within App');
  return ctx;
}
