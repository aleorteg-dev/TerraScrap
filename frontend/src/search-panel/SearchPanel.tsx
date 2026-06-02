import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ApiClient, ItemSummary, SearchMatch, SearchResult } from '../api-client';
import { ApiError } from '../api-client';

const ROW_HEIGHT = 40; // px per virtual list row
const OVERSCAN = 10; // rows above/below visible area

const SOURCE_LABEL: Record<string, string> = {
  block: 'Bloque',
  wall: 'Pared',
  chest: 'Cofre',
  object: 'Objeto',
  tile: 'Tile',
  liquid: 'Líquido',
  tile_entity: 'Entidad',
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
  onMatchFocus: (match: SearchMatch, index: number) => void;
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
  const [focusedMatchIndex, setFocusedMatchIndex] = useState<number | null>(null);
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  // default 320 so virtual window is sensible in a real browser before resize fires
  const [containerHeight, setContainerHeight] = useState(320);

  const isUserTypingRef = useRef(false);
  const searchGenRef = useRef(0);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  // Stable ref for focusedMatchIndex so navigateMatch doesn't stale-close over it
  const focusedMatchIndexRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const matchesId = `${baseId}-matches`;
  const includeContainersId = `${baseId}-include-containers`;

  // Read container height once on mount (no ResizeObserver; fixed CSS height expected)
  useEffect(() => {
    const el = listContainerRef.current;
    if (el && el.clientHeight > 0) setContainerHeight(el.clientHeight);
  }, []);

  // Autocomplete debounce + real cancellation via AbortController (also keeps a
  // generation counter as belt-and-suspenders for mocks that ignore signal).
  useEffect(() => {
    if (!isUserTypingRef.current || query.trim().length === 0) return;
    const gen = ++searchGenRef.current;
    const timer = setTimeout(() => {
      autocompleteAbortRef.current?.abort();
      const controller = new AbortController();
      autocompleteAbortRef.current = controller;
      apiClient
        .searchItems(query, undefined, { signal: controller.signal })
        .then((items) => {
          if (gen !== searchGenRef.current || controller.signal.aborted) return;
          setSuggestions(items);
          setIsDropdownOpen(items.length > 0);
        })
        .catch(() => {
          if (gen !== searchGenRef.current || controller.signal.aborted) return;
          setSuggestions([]);
          setIsDropdownOpen(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      autocompleteAbortRef.current?.abort();
    };
  }, [query, apiClient]);

  // Client-side source filter
  const filteredMatches = useMemo(() => {
    const matches = results?.matches ?? [];
    if (hiddenSources.size === 0) return matches;
    return matches.filter((m) => !hiddenSources.has(m.source));
  }, [results, hiddenSources]);

  // Sources present in current results (for filter checkboxes)
  const availableSources = useMemo(
    () => (results ? [...new Set(results.matches.map((m) => m.source))] : []),
    [results]
  );

  useEffect(() => {
    if (results === null) return;
    onResults({
      ...results,
      total: filteredMatches.length,
      matches: filteredMatches,
    });
  }, [results, filteredMatches, onResults]);

  // Virtual list bounds
  const totalFiltered = filteredMatches.length;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleEnd = Math.min(
    totalFiltered,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const virtualItems = filteredMatches.slice(visibleStart, visibleEnd);
  const paddingTop = visibleStart * ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalFiltered - visibleEnd) * ROW_HEIGHT);

  const runSearch = useCallback(
    (item: ItemSummary, containers: boolean): void => {
      focusedMatchIndexRef.current = null;
      setFocusedMatchIndex(null);
      setHiddenSources(new Set());
      setUiState('loading-search');
      setResults(null);
      setError(null);
      apiClient
        .searchInWorld(worldId, item.id, containers)
        .then((result) => {
          setResults(result);
          setUiState(result.total === 0 ? 'empty' : 'idle');
        })
        .catch((err: unknown) => {
          const apiErr =
            err instanceof ApiError ? err : new ApiError('unknown_error', 0, 'Error desconocido');
          setError(apiErr);
          setUiState('error');
        });
    },
    [worldId, apiClient]
  );

  const navigateMatch = useCallback(
    (delta: 1 | -1): void => {
      if (filteredMatches.length === 0) return;
      const prev = focusedMatchIndexRef.current;
      const next =
        prev === null
          ? delta === 1
            ? 0
            : filteredMatches.length - 1
          : (prev + delta + filteredMatches.length) % filteredMatches.length;
      const match = filteredMatches[next];
      if (match !== undefined) {
        focusedMatchIndexRef.current = next;
        setFocusedMatchIndex(next);
        onMatchFocus(match, next);
      }
    },
    [filteredMatches, onMatchFocus]
  );

  const handleClear = useCallback((): void => {
    isUserTypingRef.current = false;
    searchGenRef.current++;
    autocompleteAbortRef.current?.abort();
    focusedMatchIndexRef.current = null;
    setQuery('');
    setSuggestions([]);
    setSelectedItem(null);
    setResults(null);
    setError(null);
    setUiState('idle');
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    setFocusedMatchIndex(null);
    setHiddenSources(new Set());
    onResults(null);
  }, [onResults]);

  // Global keyboard shortcuts: n/p navigate, / focus input, Escape clear
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as Element | null;
      const isInput = target === inputRef.current;

      // Escape always clears regardless of focus location
      if (e.key === 'Escape') {
        handleClear();
        return;
      }
      // Let the input handle all other keys while it has focus
      if (isInput) return;

      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'n') {
        e.preventDefault();
        navigateMatch(1);
      } else if (e.key === 'p') {
        e.preventDefault();
        navigateMatch(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClear, navigateMatch]);

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
    }
  };

  const toggleSourceFilter = (source: string): void => {
    focusedMatchIndexRef.current = null;
    setFocusedMatchIndex(null);
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const isLoading = uiState === 'loading-search';

  const countText = (() => {
    if (hiddenSources.size > 0 && filteredMatches.length !== (results?.matches.length ?? 0)) {
      return `${filteredMatches.length} de ${results?.total ?? 0} coincidencias`;
    }
    const n = results?.total ?? 0;
    return n === 1 ? '1 coincidencia' : `${n} coincidencias`;
  })();

  return (
    <section>
      <div>
        <label htmlFor={inputId}>Buscar ítem</label>
        <input
          ref={inputRef}
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
          <p>{countText}</p>

          {availableSources.length > 1 && (
            <div aria-label="Filtrar por fuente">
              {availableSources.map((source) => (
                <label key={source}>
                  <input
                    type="checkbox"
                    checked={!hiddenSources.has(source)}
                    onChange={() => toggleSourceFilter(source)}
                    aria-label={SOURCE_LABEL[source] ?? source}
                  />
                  {SOURCE_LABEL[source] ?? source}
                </label>
              ))}
            </div>
          )}

          <div
            ref={listContainerRef}
            role="listbox"
            id={matchesId}
            aria-label="Coincidencias"
            style={{ height: '320px', overflowY: 'auto', position: 'relative' }}
            onScroll={(e) => {
              const el = e.currentTarget;
              setScrollTop(el.scrollTop);
              if (el.clientHeight > 0) setContainerHeight(el.clientHeight);
            }}
          >
            {/* Spacer creates scroll area matching full list height */}
            <div style={{ height: `${totalFiltered * ROW_HEIGHT}px`, position: 'relative' }}>
              <div style={{ position: 'absolute', top: paddingTop, width: '100%' }}>
                {virtualItems.map((match, relIdx) => {
                  const absIdx = visibleStart + relIdx;
                  const label = formatMatchLabel(match);
                  return (
                    <div
                      key={`${match.source}-${match.x}-${match.y}-${absIdx}`}
                      role="option"
                      aria-selected={focusedMatchIndex === absIdx}
                      id={`${matchesId}-opt-${absIdx}`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {label}
                      <button
                        onClick={() => {
                          focusedMatchIndexRef.current = absIdx;
                          setFocusedMatchIndex(absIdx);
                          onMatchFocus(match, absIdx);
                        }}
                        aria-label={`Centrar: ${label}`}
                      >
                        Centrar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Keep bottom padding in DOM via style on spacer (already handled by full height) */}
            {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
          </div>
        </div>
      )}

      <button onClick={handleClear} aria-label="Limpiar búsqueda">
        Limpiar
      </button>
    </section>
  );
};
