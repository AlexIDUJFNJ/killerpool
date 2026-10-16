/**
 * Tests for the history page: sign-in vs connectivity, Sync, and which games show
 */

import * as React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import HistoryPage from '../page';
import { saveGameHistory } from '@/lib/storage';
import { mergeGamesWithSupabase, isSupabaseAvailable, retryPendingSyncs } from '@/lib/sync';
import { DEFAULT_RULESET, Game } from '@/lib/types';

jest.mock('@/lib/sync', () => ({
  mergeGamesWithSupabase: jest.fn(),
  isSupabaseAvailable: jest.fn(),
  retryPendingSyncs: jest.fn(),
}));

const mockMerge = mergeGamesWithSupabase as jest.MockedFunction<typeof mergeGamesWithSupabase>;
const mockSignedIn = isSupabaseAvailable as jest.MockedFunction<typeof isSupabaseAvailable>;
const mockRetry = retryPendingSyncs as jest.MockedFunction<typeof retryPendingSyncs>;

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: 'game',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:10:00.000Z',
    status: 'completed',
    players: [
      { id: 'p1', name: 'Alice', avatar: '🎯', lives: 2, eliminated: false },
      { id: 'p2', name: 'Bob', avatar: '🎱', lives: 0, eliminated: true },
    ],
    currentPlayerIndex: 0,
    winnerId: 'p1',
    ruleset: DEFAULT_RULESET,
    history: [],
    ...overrides,
  };
}

const completed = makeGame({ id: 'won' });
const abandoned = makeGame({
  id: 'ended',
  status: 'abandoned',
  winnerId: null,
  players: [
    { id: 'p3', name: 'Carol', avatar: '⭐', lives: 2, eliminated: false },
    { id: 'p4', name: 'Dan', avatar: '🔥', lives: 1, eliminated: false },
  ],
});
// What mergeGamesWithSupabase pulls in for a game shared live and never finished
const active = makeGame({
  id: 'live',
  status: 'active',
  winnerId: null,
  players: [{ id: 'p5', name: 'Eve', avatar: '💎', lives: 3, eliminated: false }],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMerge.mockResolvedValue(undefined);
  mockRetry.mockResolvedValue(undefined);
  mockSignedIn.mockResolvedValue(false);
  saveGameHistory([completed, abandoned, active]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HistoryPage', () => {
  it('should offer guests a sign-in instead of calling them offline', async () => {
    render(<HistoryPage />);

    const signIn = await screen.findByRole('link', { name: /sign in to sync/i });
    expect(signIn).toHaveAttribute('href', '/auth');
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sync$/i })).not.toBeInTheDocument();
  });

  it('should show Offline only to a signed-in user without a connection', async () => {
    mockSignedIn.mockResolvedValue(true);
    jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    render(<HistoryPage />);

    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in to sync/i })).not.toBeInTheDocument();
  });

  it('should upload the retry queue before downloading on Sync', async () => {
    mockSignedIn.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<HistoryPage />);

    await user.click(await screen.findByRole('button', { name: /^sync$/i }));

    await waitFor(() => expect(mockMerge).toHaveBeenCalledTimes(1));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockRetry.mock.invocationCallOrder[0]).toBeLessThan(mockMerge.mock.invocationCallOrder[0]);
    expect(await screen.findByText('History is up to date')).toBeInTheDocument();
  });

  it('should list finished games and leave unfinished ones out', async () => {
    render(<HistoryPage />);

    expect(await screen.findByText('Alice Won!')).toBeInTheDocument();
    expect(screen.getByText('Game Abandoned')).toBeInTheDocument();
    expect(screen.queryByText('Eve')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /view details/i })).toHaveLength(2);
  });

  it('should show only abandoned games under the Abandoned filter', async () => {
    const user = userEvent.setup();
    render(<HistoryPage />);

    const abandonedFilter = await screen.findByRole('button', { name: 'Abandoned' });
    await user.click(abandonedFilter);

    expect(abandonedFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Game Abandoned')).toBeInTheDocument();
    expect(screen.queryByText('Alice Won!')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 games')).toBeInTheDocument();
  });

  it('should drop a deleted game from the list', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<HistoryPage />);

    const [first] = await screen.findAllByRole('button', { name: /^delete game from/i });
    await user.click(first);

    expect(screen.getAllByRole('button', { name: /^delete game from/i })).toHaveLength(1);
  });

  it('should show what Sync brought down', async () => {
    mockSignedIn.mockResolvedValue(true);
    mockMerge.mockImplementation(async () => {
      saveGameHistory([makeGame({ id: 'remote', winnerId: 'p2' }), completed, abandoned]);
    });
    const user = userEvent.setup();
    render(<HistoryPage />);

    await user.click(await screen.findByRole('button', { name: /^sync$/i }));

    expect(await screen.findByText('Bob Won!')).toBeInTheDocument();
  });

  it('should pick up a game finished in another tab', async () => {
    render(<HistoryPage />);
    await screen.findByText('Alice Won!');

    // Another tab writes the key; this one only hears the storage event
    localStorage.setItem(
      'killerpool_game_history',
      JSON.stringify([makeGame({ id: 'other-tab', winnerId: 'p2' }), completed])
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'killerpool_game_history' }));
    });

    expect(screen.getByText('Bob Won!')).toBeInTheDocument();
    expect(screen.queryByText('Game Abandoned')).not.toBeInTheDocument();
  });

  it('should render on the server without the stored list, and hydrate without a mismatch', async () => {
    // The server has no localStorage. What it sends has to be what the first
    // client render produces, or React throws the markup away
    const html = renderToString(<HistoryPage />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Alice');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onRecoverableError = jest.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <HistoryPage />, { onRecoverableError });
    });

    expect(await within(container).findByText('Alice Won!')).toBeInTheDocument();
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    act(() => root?.unmount());
    container.remove();
  });

  it('should name each delete button after its game', async () => {
    render(<HistoryPage />);

    const buttons = await screen.findAllByRole('button', { name: /^delete game from/i });
    expect(buttons).toHaveLength(2);
  });
});
