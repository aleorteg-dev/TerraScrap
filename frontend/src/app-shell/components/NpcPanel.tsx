import { type FC } from 'react';
import { useAppContext } from '../AppContext';
import type { Npc } from '../../api-client';

interface NpcPanelProps {
  onCenterOn: (x: number, y: number) => void;
}

export const NpcPanel: FC<NpcPanelProps> = ({ onCenterOn }) => {
  const { state } = useAppContext();

  if (state.kind !== 'WorldLoaded') return null;

  const { npcs } = state;

  function renderNpc(npc: Npc): React.ReactElement {
    return (
      <li key={npc.id} className="app-npc-item">
        <button
          className="npc app-npc-btn"
          onClick={() => onCenterOn(npc.x, npc.y)}
          title={`${npc.x}, ${npc.y}`}
        >
          <span className="npc-av" aria-hidden="true">
            {npc.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="npc-name app-npc-name">{npc.name}</span>
          <span className="npc-loc app-npc-type">
            {npc.x},{npc.y}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="npc-list-wrap app-npc-panel" data-testid="npc-panel">
      {npcs === null && <span className="app-npc-loading">Cargando NPCs…</span>}
      {npcs !== null && npcs.length === 0 && (
        <span className="app-npc-empty">No hay NPCs en este mundo.</span>
      )}
      {npcs !== null && npcs.length > 0 && (
        <ul className="npc-list app-npc-list">{npcs.map(renderNpc)}</ul>
      )}
    </div>
  );
};
