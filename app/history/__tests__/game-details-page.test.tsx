/**
 * Tests for the game details page: timeline order and abandoned games
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { copyGameSummary, exportScreenshot, shareGame } from '@/lib/export';
import GameDetailsPage from '../[id]/page';
import { saveGameHistory } from '@/lib/storage';
import { DEFAULT_RULESET, Game, GameHistoryEntry } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'game-1' }),
}));

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));

jest.mock('@/lib/export', () => ({
  exportGameToCSV: jest.fn(),
  exportScreenshot: jest.fn(),
  shareGame: jest.fn(),
  copyGameSummary: jest.fn(),
}));

function entry(n: number, action: GameHistoryEntry['action'], playerName: string): GameHistoryEntry {
  return {
    id: `h${n}`,
    action,
    playerId: playerName === 'Alice' ? 'p1' : 'p2',
    playerName,
    timestamp: `2026-10-16T10:0${n}:00.000Z`,
    livesBefore: 3,
    livesAfter: action === 'miss' ? 2 : action === 'pot_black' ? 4 : 3,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:09:00.000Z',
    status: 'completed',
    players: [
      { id: 'p1', name: 'Alice', avatar: '🎯', lives: 4, eliminated: false },
      { id: 'p2', name: 'Bob', avatar: '🎱', lives: 0, eliminated: true },
    ],
    currentPlayerIndex: 0,
    winnerId: 'p1',
    ruleset: DEFAULT_RULESET,
    // Stored oldest first, the way applyAction appends
    history: [entry(1, 'miss', 'Bob'), entry(2, 'pot', 'Alice'), entry(3, 'pot_black', 'Alice')],
    ...overrides,
  };
}

function timelineRows() {
  return within(screen.getByRole('list', { name: 'Action timeline' })).getAllByRole('listitem');
}

describe('GameDetailsPage', () => {
  it('should number the timeline from the first shot', async () => {
    saveGameHistory([makeGame()]);
    render(<GameDetailsPage />);
    await screen.findByText('Action Timeline');

    const rows = timelineRows();
    expect(rows.map((row) => row.textContent?.match(/#\d+$/)?.[0])).toEqual(['#1', '#2', '#3']);
    // #1 is the oldest entry, Bob's miss
    expect(rows[0]).toHaveTextContent('Bob');
    expect(rows[0]).toHaveTextContent('MISS');
    expect(rows[2]).toHaveTextContent('POT BLACK');
  });

  it('should show an abandoned game without a winner', async () => {
    saveGameHistory([makeGame({ status: 'abandoned', winnerId: 'p1' })]);
    render(<GameDetailsPage />);

    expect(await screen.findByText('Game Abandoned')).toBeInTheDocument();
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
  });

  it('should crown the winner of a completed game', async () => {
    saveGameHistory([makeGame()]);
    render(<GameDetailsPage />);

    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(screen.queryByText('Game Abandoned')).not.toBeInTheDocument();
  });

  it('should show the awards and match stats of a completed game', async () => {
    // Alice pots three in a row: MVP and Hot Streak
    saveGameHistory([
      makeGame({
        history: [entry(1, 'pot', 'Alice'), entry(2, 'miss', 'Bob'), entry(3, 'pot', 'Alice'), entry(4, 'pot_black', 'Alice')],
      }),
    ]);
    render(<GameDetailsPage />);

    const awards = within(await screen.findByRole('region', { name: 'Awards' })).getAllByRole('listitem');
    expect(awards.map((a) => a.textContent)).toEqual([
      '🏅MVP🎯Alice3 balls potted',
      '🔥Hot Streak🎯Alicestreak of 3',
    ]);
    const rows = within(screen.getByRole('region', { name: 'Match stats' })).getAllByRole('row');
    // Header, then the winner first
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent(/Alice.*Winner/);
  });

  it('should give an abandoned game its stats but no awards', async () => {
    saveGameHistory([makeGame({ status: 'abandoned', winnerId: 'p1' })]);
    render(<GameDetailsPage />);

    expect(await screen.findByRole('region', { name: 'Match stats' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Awards' })).not.toBeInTheDocument();
  });

  it('should explain a failed screenshot on the page instead of in alert()', async () => {
    saveGameHistory([makeGame()]);
    (exportScreenshot as jest.Mock).mockRejectedValueOnce(new Error('canvas'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<GameDetailsPage />);

    await user.click(await screen.findByRole('button', { name: /screenshot/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/screenshot couldn.t be created/i);
    expect(alertSpy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('should say the summary was copied when sharing is unavailable', async () => {
    saveGameHistory([makeGame()]);
    (shareGame as jest.Mock).mockResolvedValueOnce(false);
    (copyGameSummary as jest.Mock).mockResolvedValueOnce(true);
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<GameDetailsPage />);

    await user.click(await screen.findByRole('button', { name: /^share$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/copied to the clipboard/i);
    expect(alertSpy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
