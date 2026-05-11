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
    const typeLabel = npc.type === 'town' ? 'Pueblo' : 'Banner';
    return (
      <li key={npc.id} className="app-npc-item">
        <button
          className="app-npc-btn"
          onClick={() => onCenterOn(npc.x, npc.y)}
          title={`${npc.x}, ${npc.y}`}
        >
          <span className="app-npc-name">{npc.name}</span>
          <span className="app-npc-type">{typeLabel}</span>
        </button>
      </li>
    );
  }

  return (
    <div className="app-npc-panel" data-testid="npc-panel">
      {npcs === null && <span className="app-npc-loading">Cargando NPCs…</span>}
      {npcs !== null && npcs.length === 0 && (
        <span className="app-npc-empty">No hay NPCs en este mundo.</span>
      )}
      {npcs !== null && npcs.length > 0 && <ul className="app-npc-list">{npcs.map(renderNpc)}</ul>}
    </div>
  );
};
