import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SearchPanel } from '../SearchPanel';
import { SOURCE_LABEL } from '../sourceLabels';
import type { ApiClient, ItemSummary, SearchResult, SearchMatch } from '../../api-client';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockItem: ItemSummary = { id: 1, name: 'Zenith', sprite_url: '', category: 'Sword' };
const mockItem2: ItemSummary = { id: 2, name: 'Zenith Blade', sprite_url: '', category: 'Sword' };

const mockMatch: SearchMatch = { x: 100, y: 200, source: 'chest', chest_id: 5, stack: 1 };

const mockResult: SearchResult = { item_id: 1, total: 1, matches: [mockMatch] };
const emptyResult: SearchResult = { item_id: 1, total: 0, matches: [] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(
  suggestions: ItemSummary[] = [mockItem],
  result: SearchResult = mockResult
): {
  client: ApiClient;
  searchItems: ReturnType<typeof vi.fn>;
  searchInWorld: ReturnType<typeof vi.fn>;
} {
  const searchItems = vi.fn().mockResolvedValue(suggestions);
  const searchInWorld = vi.fn().mockResolvedValue(result);
  const client = {
    uploadWorld: vi.fn(),
    getWorldMetadata: vi.fn(),
    getTilesChunk: vi.fn(),
    searchItems,
    searchInWorld,
    deleteWorld: vi.fn(),
  } as unknown as ApiClient;
  return { client, searchItems, searchInWorld };
}

interface SetupResult {
  onResults: ReturnType<typeof vi.fn>;
  onMatchFocus: ReturnType<typeof vi.fn>;
  searchInWorld: ReturnType<typeof vi.fn>;
  searchItems: ReturnType<typeof vi.fn>;
}

async function renderAndSelect(
  suggestions: ItemSummary[] = [mockItem],
  result: SearchResult = mockResult
): Promise<SetupResult> {
  const onResults = vi.fn();
  const onMatchFocus = vi.fn();
  const { client, searchItems, searchInWorld } = makeClient(suggestions, result);

  vi.useFakeTimers();
  render(
    <SearchPanel
      worldId="w1"
      apiClient={client}
      onResults={onResults}
      onMatchFocus={onMatchFocus}
    />
  );

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zen' } });
  act(() => {
    vi.advanceTimersByTime(250);
  });
  vi.useRealTimers();

  await screen.findByRole('option');
  fireEvent.click(screen.getByRole('option'));
  await waitFor(() => expect(searchInWorld).toHaveBeenCalledOnce());

  return { onResults, onMatchFocus, searchInWorld, searchItems };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchPanel', () => {
  afterEach(() => vi.useRealTimers());

  it('T-01 renders search input and empty state', () => {
    const { client } = makeClient();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('T-02 debounces autocomplete calls', async () => {
    const { client, searchItems } = makeClient();
    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'z' } });
    fireEvent.change(input, { target: { value: 'ze' } });
    fireEvent.change(input, { target: { value: 'zen' } });

    expect(searchItems).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();

    await waitFor(() => expect(searchItems).toHaveBeenCalledTimes(1));
    expect(searchItems).toHaveBeenCalledWith(
      'zen',
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('T-03 selecting an item triggers searchInWorld', async () => {
    const { client, searchInWorld } = makeClient();
    const onResults = vi.fn();

    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={onResults} onMatchFocus={vi.fn()} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zen' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();

    await screen.findByRole('option');
    fireEvent.click(screen.getByRole('option'));

    await waitFor(() => expect(searchInWorld).toHaveBeenCalledWith('w1', 1, true));
    await waitFor(() => expect(onResults).toHaveBeenCalledWith(mockResult));
  });

  it('T-03b exposes an accessible include_containers control enabled by default', () => {
    const { client } = makeClient();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );

    expect(screen.getByRole('checkbox', { name: /incluir contenedores/i })).toBeChecked();
  });

  it('T-04 displays matches list with count', async () => {
    await renderAndSelect();
    expect(screen.getByText(/1 coincidencia/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /centrar/i })).toHaveLength(1);
  });

  it('T-05 clicking a match calls onMatchFocus with match and index', async () => {
    const { onMatchFocus } = await renderAndSelect();
    fireEvent.click(screen.getByRole('button', { name: /centrar/i }));
    expect(onMatchFocus).toHaveBeenCalledWith(mockMatch, 0);
  });

  it('T-06 unchecking include_containers sends false on the next search', async () => {
    const { searchInWorld } = await renderAndSelect();
    fireEvent.click(screen.getByRole('checkbox', { name: /incluir contenedores/i }));
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledTimes(2));
    expect(searchInWorld).toHaveBeenLastCalledWith('w1', 1, false);
  });

  it('T-06b checking include_containers again sends true on the next search', async () => {
    const { searchInWorld } = await renderAndSelect();
    const includeContainersControl = screen.getByRole('checkbox', {
      name: /incluir contenedores/i,
    });

    fireEvent.click(includeContainersControl);
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledTimes(2));

    fireEvent.click(includeContainersControl);
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledTimes(3));
    expect(searchInWorld).toHaveBeenLastCalledWith('w1', 1, true);
  });

  it('T-06c keeps the selected search parameters when toggling include_containers', async () => {
    const { searchInWorld, searchItems } = await renderAndSelect([mockItem2], {
      item_id: 2,
      total: 1,
      matches: [mockMatch],
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /incluir contenedores/i }));

    await waitFor(() => expect(searchInWorld).toHaveBeenCalledTimes(2));
    expect(searchItems).toHaveBeenCalledWith(
      'zen',
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(searchInWorld).toHaveBeenNthCalledWith(1, 'w1', 2, true);
    expect(searchInWorld).toHaveBeenNthCalledWith(2, 'w1', 2, false);
  });

  it('T-07 shows empty result message', async () => {
    await renderAndSelect([mockItem], emptyResult);
    expect(screen.getByText(/sin coincidencias/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('T-08 clear button resets state and calls onResults(null)', async () => {
    const { onResults } = await renderAndSelect();
    await waitFor(() => expect(screen.getByText(/1 coincidencia/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /limpiar/i }));
    expect(onResults).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/coincidencia/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('T-09 keyboard navigation through autocomplete list', async () => {
    const { client, searchInWorld } = makeClient([mockItem, mockItem2]);
    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'zen' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();

    const options = await screen.findAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledWith('w1', 2, true));
  });

  // ── New tests (iter-18) ────────────────────────────────────────────────────

  it('T-10 with 10000 matches renders only a virtualized subset in DOM', async () => {
    const matches: SearchMatch[] = Array.from({ length: 10000 }, (_, i) => ({
      x: i,
      y: 0,
      source: 'block' as const,
    }));
    await renderAndSelect([mockItem], { item_id: 1, total: 10000, matches });
    // Only the virtual window (~OVERSCAN * 2) rendered, not all 10000
    const renderedOptions = screen.getAllByRole('option');
    expect(renderedOptions.length).toBeLessThan(100);
    expect(renderedOptions.length).toBeGreaterThan(0);
  });

  it('T-11 key n navigates to next match via onMatchFocus', async () => {
    const match1: SearchMatch = { x: 0, y: 0, source: 'block' };
    const match2: SearchMatch = { x: 1, y: 1, source: 'block' };
    const { onMatchFocus } = await renderAndSelect([mockItem], {
      item_id: 1,
      total: 2,
      matches: [match1, match2],
    });
    // Wait for results in DOM so effects re-run with updated navigateMatch
    await screen.findByText(/2 coincidencias/i);
    fireEvent.keyDown(window, { key: 'n', bubbles: true });
    expect(onMatchFocus).toHaveBeenCalledWith(match1, 0);
    fireEvent.keyDown(window, { key: 'n', bubbles: true });
    expect(onMatchFocus).toHaveBeenCalledWith(match2, 1);
  });

  it('T-12 key p wraps around to last match when at start', async () => {
    const match1: SearchMatch = { x: 0, y: 0, source: 'block' };
    const match2: SearchMatch = { x: 1, y: 1, source: 'block' };
    const { onMatchFocus } = await renderAndSelect([mockItem], {
      item_id: 1,
      total: 2,
      matches: [match1, match2],
    });
    // Wait for results in DOM so effects re-run with updated navigateMatch
    await screen.findByText(/2 coincidencias/i);
    fireEvent.keyDown(window, { key: 'p', bubbles: true });
    // null → wrap-around → last index (1)
    expect(onMatchFocus).toHaveBeenCalledWith(match2, 1);
  });

  it('T-13 key / focuses the search input', () => {
    const { client } = makeClient();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(window, { key: '/', bubbles: true });
    expect(document.activeElement).toBe(input);
  });

  it('T-14 key Escape clears search and calls onResults(null)', async () => {
    const { onResults } = await renderAndSelect();
    await waitFor(() => expect(screen.getByText(/1 coincidencia/i)).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
    expect(onResults).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/coincidencia/i)).not.toBeInTheDocument();
  });

  it('T-15 deselecting wall source filter hides wall matches', async () => {
    const wallMatch: SearchMatch = { x: 1, y: 2, source: 'wall' };
    const blockMatch: SearchMatch = { x: 3, y: 4, source: 'block' };
    const { onResults } = await renderAndSelect([mockItem], {
      item_id: 1,
      total: 2,
      matches: [wallMatch, blockMatch],
    });
    // Both visible initially
    expect(screen.getByText(/Pared en \(1, 2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Bloque en \(3, 4\)/i)).toBeInTheDocument();
    // Deselect wall
    const wallCheckbox = screen.getByRole('checkbox', { name: /^pared$/i });
    fireEvent.click(wallCheckbox);
    // Wall match hidden, block match visible
    expect(screen.queryByText(/Pared en \(1, 2\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Bloque en \(3, 4\)/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(onResults).toHaveBeenLastCalledWith({
        item_id: 1,
        total: 1,
        matches: [blockMatch],
      })
    );
  });

  it('T-16 two keystrokes under 200ms produce one autocomplete request', async () => {
    const { client, searchItems } = makeClient();
    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(searchItems).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    await waitFor(() => expect(searchItems).toHaveBeenCalledTimes(1));
    expect(searchItems).toHaveBeenCalledWith(
      'ab',
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('T-18 typing again aborts the in-flight autocomplete request via AbortSignal', async () => {
    const signals: AbortSignal[] = [];
    const searchItems = vi
      .fn()
      .mockImplementation((_q: string, _l: number | undefined, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        return new Promise(() => {
          /* never resolves */
        });
      });
    const client = {
      uploadWorld: vi.fn(),
      getWorldMetadata: vi.fn(),
      getTilesChunk: vi.fn(),
      searchItems,
      searchInWorld: vi.fn(),
      deleteWorld: vi.fn(),
    } as unknown as ApiClient;

    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={vi.fn()} onMatchFocus={vi.fn()} />
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'ze' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    fireEvent.change(input, { target: { value: 'zen' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();

    expect(signals[0]?.aborted).toBe(true);
    expect(signals).toHaveLength(2);
  });

  it('T-17 matches listbox has role listbox and items have aria-selected attribute', async () => {
    await renderAndSelect();
    // Matches container carries role=listbox
    const listbox = screen.getByRole('listbox', { name: /coincidencias/i });
    expect(listbox).toBeInTheDocument();
    // Each rendered option has aria-selected
    const options = screen.getAllByRole('option');
    for (const opt of options) {
      expect(opt).toHaveAttribute('aria-selected');
    }
  });

  it('T-18 stale searchInWorld response never overwrites the latest search (E17)', async () => {
    let resolveFirst!: (r: SearchResult) => void;
    let resolveSecond!: (r: SearchResult) => void;
    const onResults = vi.fn();
    const { client, searchInWorld } = makeClient();
    searchInWorld
      .mockImplementationOnce(
        () =>
          new Promise<SearchResult>((res) => {
            resolveFirst = res;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<SearchResult>((res) => {
            resolveSecond = res;
          })
      );

    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={onResults} onMatchFocus={vi.fn()} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zen' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    await screen.findByRole('option');
    fireEvent.click(screen.getByRole('option'));

    // Segunda búsqueda mientras la primera sigue en vuelo (toggle contenedores).
    fireEvent.click(screen.getByRole('checkbox'));
    expect(searchInWorld).toHaveBeenCalledTimes(2);

    const staleResult: SearchResult = { item_id: 1, total: 1, matches: [mockMatch] };
    const latestResult: SearchResult = {
      item_id: 1,
      total: 3,
      matches: [
        { x: 1, y: 2, source: 'block' },
        { x: 3, y: 4, source: 'block' },
        { x: 5, y: 6, source: 'block' },
      ],
    };

    // La búsqueda vigente resuelve primero; la obsoleta llega después.
    await act(async () => {
      resolveSecond(latestResult);
    });
    await act(async () => {
      resolveFirst(staleResult);
    });

    expect(screen.getByText('3 coincidencias')).toBeInTheDocument();
    expect(screen.queryByText('1 coincidencia')).not.toBeInTheDocument();
    const lastResults = onResults.mock.calls.at(-1)?.[0] as SearchResult;
    expect(lastResults.total).toBe(3);
  });

  it('T-18b a search resolving after Limpiar does not repopulate results (E17)', async () => {
    let resolveSearch!: (r: SearchResult) => void;
    const onResults = vi.fn();
    const { client, searchInWorld } = makeClient();
    searchInWorld.mockImplementationOnce(
      () =>
        new Promise<SearchResult>((res) => {
          resolveSearch = res;
        })
    );

    vi.useFakeTimers();
    render(
      <SearchPanel worldId="w1" apiClient={client} onResults={onResults} onMatchFocus={vi.fn()} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zen' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    await screen.findByRole('option');
    fireEvent.click(screen.getByRole('option'));

    fireEvent.click(screen.getByRole('button', { name: /limpiar búsqueda/i }));
    onResults.mockClear();

    await act(async () => {
      resolveSearch(mockResult);
    });

    expect(screen.queryByText(/coincidencia/)).not.toBeInTheDocument();
    expect(onResults).not.toHaveBeenCalled();
  });

  it('T-19 SOURCE_LABEL only covers the contract v0.2 sources (M13)', () => {
    expect(Object.keys(SOURCE_LABEL).sort()).toEqual(['block', 'chest', 'object', 'wall']);
  });
});
