import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ApiClient, ItemSummary, SearchMatch, SearchResult } from '../api-client';
import { ApiError } from '../api-client';

const SOURCE_LABEL: Record<string, string> = {
  block: 'Bloque',
  wall: 'Pared',
  chest: 'Cofre',
  object: 'Objeto',
};

function formatMatchLabel(match: SearchMatch): string {
  const src = SOURCE_LABEL[match.source] ?? match.source;
  let label = `${src} en (${match.x}, ${match.y})`;
  if (match.chest_id != null) label += ` #${match.chest_id}`;
  if (match.stack != null) label += ` ×${match.stack}`;
  return label;
}

type UiState = 'idle' | 'loading-search' | 'empty' | 'error';

export interface SearchPanelProps {
  worldId: string;
  apiClient: ApiClient;
  onResults: (r: SearchResult | null) => void;
  onMatchFocus: (match: SearchMatch) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  worldId,
  apiClient,
  onResults,
  onMatchFocus,
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ItemSummary[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemSummary | null>(null);
  const [includeContainers, setIncludeContainers] = useState(true);
  const [uiState, setUiState] = useState<UiState>('idle');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Distinguishes user keystrokes from programmatic query changes (e.g. item selection).
  const isUserTypingRef = useRef(false);

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const includeContainersId = `${baseId}-include-containers`;

  useEffect(() => {
    if (!isUserTypingRef.current || query.trim().length === 0) return;
    const timer = setTimeout(() => {
      apiClient
        .searchItems(query)
        .then((items) => {
          setSuggestions(items);
          setIsDropdownOpen(items.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setIsDropdownOpen(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, apiClient]);

  const runSearch = useCallback(
    (item: ItemSummary, containers: boolean): void => {
      setUiState('loading-search');
      setResults(null);
      setError(null);
      apiClient
        .searchInWorld(worldId, item.id, containers)
        .then((result) => {
          setResults(result);
          onResults(result);
          setUiState(result.total === 0 ? 'empty' : 'idle');
        })
        .catch((err: unknown) => {
          const apiErr =
            err instanceof ApiError ? err : new ApiError('unknown_error', 0, 'Error desconocido');
          setError(apiErr);
          setUiState('error');
        });
    },
    [worldId, apiClient, onResults]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    isUserTypingRef.current = value.trim().length > 0;
    setQuery(value);
    setSelectedItem(null);
    if (value.trim().length === 0) {
      setSuggestions([]);
      setIsDropdownOpen(false);
    }
  };

  const handleSelect = (item: ItemSummary): void => {
    isUserTypingRef.current = false;
    setSelectedItem(item);
    setQuery(item.name);
    setSuggestions([]);
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    runSearch(item, includeContainers);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const checked = e.target.checked;
    setIncludeContainers(checked);
    if (selectedItem !== null) {
      runSearch(selectedItem, checked);
    }
  };

  const handleClear = (): void => {
    isUserTypingRef.current = false;
    setQuery('');
    setSuggestions([]);
    setSelectedItem(null);
    setResults(null);
    setError(null);
    setUiState('idle');
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    onResults(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!isDropdownOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const item = suggestions[activeIndex];
      if (item !== undefined) handleSelect(item);
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  const isLoading = uiState === 'loading-search';

  return (
    <section>
      <div>
        <label htmlFor={inputId}>Buscar ítem</label>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Nombre o ID del ítem..."
          autoComplete="off"
        />
      </div>

      {isDropdownOpen && (
        <ul role="listbox" id={listboxId}>
          {suggestions.map((item, idx) => (
            <li
              key={item.id}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={() => handleSelect(item)}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          id={includeContainersId}
          type="checkbox"
          checked={includeContainers}
          onChange={handleCheckboxChange}
        />
        <label htmlFor={includeContainersId}>Incluir contenedores</label>
      </div>

      {isLoading && (
        <p role="status" aria-live="polite">
          Buscando...
        </p>
      )}

      {uiState === 'error' && error !== null && <div role="alert">{error.message}</div>}

      {uiState === 'empty' && <p>Sin coincidencias</p>}

      {results !== null && results.total > 0 && (
        <div>
          <p>
            {results.total} {results.total === 1 ? 'coincidencia' : 'coincidencias'}
          </p>
          <ul>
            {results.matches.map((match) => (
              <li key={`${match.source}-${match.x}-${match.y}`}>
                {formatMatchLabel(match)}
                <button
                  onClick={() => onMatchFocus(match)}
                  aria-label={`Centrar: ${formatMatchLabel(match)}`}
                >
                  Centrar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleClear} aria-label="Limpiar búsqueda">
        Limpiar
      </button>
    </section>
  );
};
