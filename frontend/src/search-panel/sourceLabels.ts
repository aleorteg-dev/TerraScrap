import type { SearchMatch } from '../api-client';

// Solo los source que el contrato v0.2 puede emitir (IT-10, M13). Las
// etiquetas de v0.3 (tile/liquid/tile_entity) están reservadas en el doc del
// módulo y se reintroducirán cuando el contrato las emita.
export const SOURCE_LABEL: Record<SearchMatch['source'], string> = {
  block: 'Bloque',
  wall: 'Pared',
  chest: 'Cofre',
  object: 'Objeto',
};

export const SOURCE_VAR: Record<SearchMatch['source'], string> = {
  block: 'var(--src-block)',
  wall: 'var(--src-wall)',
  chest: 'var(--src-chest)',
  object: 'var(--src-object)',
};
