import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ApiClient, ItemSummary, SearchMatch, SearchResult } from '../api-client';
import { ApiError } from '../api-client';
import './SearchPanel.css';

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

const SOURCE_LABEL: Record<string, string> = {
  block: 'Bloque',
  wall: 'Pared',
  chest: 'Cofre',
  object: 'Objeto',
  tile: 'Tile',
  liquid: 'Líquido',
  tile_entity: 'Entidad',
};

const SOURCE_VAR: Record<string, string> = {
  block: 'var(--src-block)',
  wall: 'var(--src-wall)',
  chest: 'var(--src-chest)',
  object: 'var(--src-object)',
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
  const [containerHeight, setContainerHeight] = useState(320);

  const isUserTypingRef = useRef(false);
  const searchGenRef = useRef(0);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const focusedMatchIndexRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const matchesId = `${baseId}-matches`;
  const includeContainersId = `${baseId}-include-containers`;

  useEffect(() => {
    const el = listContainerRef.current;
    if (el && el.clientHeight > 0) setContainerHeight(el.clientHeight);
  }, []);

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

  const filteredMatches = useMemo(() => {
    const matches = results?.matches ?? [];
    if (hiddenSources.size === 0) return matches;
    return matches.filter((m) => !hiddenSources.has(m.source));
  }, [results, hiddenSources]);

  const availableSources = useMemo(
    () => (results ? [...new Set(results.matches.map((m) => m.source))] : []),
    [results]
  );

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of results?.matches ?? []) {
      counts[m.source] = (counts[m.source] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  useEffect(() => {
    if (results === null) return;
    onResults({
      ...results,
      total: filteredMatches.length,
      matches: filteredMatches,
    });
  }, [results, filteredMatches, onResults]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as Element | null;
      const isInput = target === inputRef.current;
      if (e.key === 'Escape') {
        handleClear();
        return;
      }
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
    <section className="search-panel">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4-4" />
          </svg>
        </span>
        <label htmlFor={inputId} className="sr-only">
          Buscar ítem
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="search-input"
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Nombre o ID del ítem…"
          autoComplete="off"
        />
        {query.length > 0 && (
          <button
            type="button"
            className="search-clear"
            onClick={handleClear}
            aria-label="Borrar texto"
          >
            ✕
          </button>
        )}

        {isDropdownOpen && (
          <ul role="listbox" id={listboxId} className="autocomplete open">
            {suggestions.map((item, idx) => (
              <li
                key={item.id}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={activeIndex === idx}
                className={`ac-item${activeIndex === idx ? ' active' : ''}`}
                onClick={() => handleSelect(item)}
              >
                <span className="ac-sprite" aria-hidden="true" />
                <span className="ac-name">{item.name}</span>
                <span className="ac-id">#{item.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="search-opts">
        <label className="toggle" htmlFor={includeContainersId}>
          <input
            id={includeContainersId}
            type="checkbox"
            checked={includeContainers}
            onChange={handleCheckboxChange}
          />
          <span className="track" aria-hidden="true" />
          <span>Incluir contenedores</span>
        </label>
        <span className="hint">
          <span className="kbd">/</span>
        </span>
      </div>

      {isLoading && (
        <p role="status" aria-live="polite" className="search-status">
          Buscando…
        </p>
      )}

      {uiState === 'error' && error !== null && (
        <div role="alert" className="search-error">
          {error.message}
        </div>
      )}

      {uiState === 'empty' && (
        <div className="empty-state">
          <p>Sin coincidencias</p>
        </div>
      )}

      {results !== null && results.total > 0 && (
        <>
          <div className="results-meta">
            <span className="results-count">{countText}</span>
          </div>

          {availableSources.length > 1 && (
            <div className="source-filters" aria-label="Filtrar por fuente">
              {availableSources.map((source) => {
                const off = hiddenSources.has(source);
                return (
                  <label
                    key={source}
                    className={`src-chip${off ? ' off' : ''}`}
                    style={
                      {
                        ['--mc' as string]: SOURCE_VAR[source] ?? 'var(--gold)',
                      } as React.CSSProperties
                    }
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={!off}
                      onChange={() => toggleSourceFilter(source)}
                      aria-label={SOURCE_LABEL[source] ?? source}
                    />
                    <span
                      className="swatch"
                      style={{ background: SOURCE_VAR[source] ?? 'var(--gold)' }}
                      aria-hidden="true"
                    />
                    <span>{SOURCE_LABEL[source] ?? source}</span>
                    <span className="n">{sourceCounts[source] ?? 0}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div
            ref={listContainerRef}
            role="listbox"
            id={matchesId}
            aria-label="Coincidencias"
            className="match-list"
            style={{ height: '320px', overflowY: 'auto', position: 'relative' }}
            onScroll={(e) => {
              const el = e.currentTarget;
              setScrollTop(el.scrollTop);
              if (el.clientHeight > 0) setContainerHeight(el.clientHeight);
            }}
          >
            <div style={{ height: `${totalFiltered * ROW_HEIGHT}px`, position: 'relative' }}>
              <div style={{ position: 'absolute', top: paddingTop, width: '100%' }}>
                {virtualItems.map((match, relIdx) => {
                  const absIdx = visibleStart + relIdx;
                  const label = formatMatchLabel(match);
                  const color = SOURCE_VAR[match.source] ?? 'var(--gold)';
                  return (
                    <div
                      key={`${match.source}-${match.x}-${match.y}-${absIdx}`}
                      role="option"
                      aria-selected={focusedMatchIndex === absIdx}
                      id={`${matchesId}-opt-${absIdx}`}
                      className={`match${focusedMatchIndex === absIdx ? ' active' : ''}`}
                      style={
                        { height: ROW_HEIGHT, ['--mc' as string]: color } as React.CSSProperties
                      }
                      onClick={() => {
                        focusedMatchIndexRef.current = absIdx;
                        setFocusedMatchIndex(absIdx);
                        onMatchFocus(match, absIdx);
                      }}
                    >
                      <span className="match-badge" aria-hidden="true" style={{ color }} />
                      <span className="match-main">
                        <span className="match-title">{label}</span>
                      </span>
                      <button
                        type="button"
                        className="match-go"
                        onClick={(e) => {
                          e.stopPropagation();
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
            {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
          </div>
        </>
      )}

      <div className="search-foot">
        <button
          type="button"
          className="btn-ghost"
          onClick={handleClear}
          aria-label="Limpiar búsqueda"
        >
          Limpiar
        </button>
      </div>
    </section>
  );
};
