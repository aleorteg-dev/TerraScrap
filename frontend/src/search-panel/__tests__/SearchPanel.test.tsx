import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SearchPanel } from '../SearchPanel';
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
    expect(searchItems).toHaveBeenCalledWith('zen');
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

    await waitFor(() => expect(searchInWorld).toHaveBeenCalledWith('w1', 1, false));
    await waitFor(() => expect(onResults).toHaveBeenCalledWith(mockResult));
  });

  it('T-04 displays matches list with count', async () => {
    await renderAndSelect();
    expect(screen.getByText(/1 coincidencia/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /centrar/i })).toHaveLength(1);
  });

  it('T-05 clicking a match calls onMatchFocus', async () => {
    const { onMatchFocus } = await renderAndSelect();
    fireEvent.click(screen.getByRole('button', { name: /centrar/i }));
    expect(onMatchFocus).toHaveBeenCalledWith(mockMatch);
  });

  it('T-06 toggling include_containers re-triggers search', async () => {
    const { searchInWorld } = await renderAndSelect();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledTimes(2));
    expect(searchInWorld).toHaveBeenLastCalledWith('w1', 1, true);
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
    await waitFor(() => expect(searchInWorld).toHaveBeenCalledWith('w1', 2, false));
  });
});
