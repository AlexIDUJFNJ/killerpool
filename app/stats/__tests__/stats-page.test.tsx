/**
 * Tests for the stats page wiring: which ids it asks computeStats to match
 */

import { render, screen } from '@testing-library/react';
import StatsPage from '../page';
import { createClient } from '@/lib/supabase/client';
import { getGuestId, saveGameHistory } from '@/lib/storage';
import { DEFAULT_RULESET, Game } from '@/lib/types';

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function mockUser(id: string | null) {
  mockCreateClient.mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: id ? { id } : null } }) },
  } as unknown as ReturnType<typeof createClient>);
}

function wonGame(id: string, ownerId: string, status: Game['status'] = 'completed'): Game {
  return {
    id,
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:10:00.000Z',
    status,
    players: [
      { id: `${id}-me`, name: 'Me', avatar: '🎯', lives: 2, eliminated: false, userId: ownerId },
      { id: `${id}-them`, name: 'Them', avatar: '🎱', lives: 0, eliminated: true, userId: null },
    ],
    currentPlayerIndex: 0,
    winnerId: status === 'completed' ? `${id}-me` : null,
    ruleset: DEFAULT_RULESET,
    history: [],
  };
}

function statValue(label: string) {
  return screen.getByText(label).previousElementSibling?.textContent;
}

describe('StatsPage', () => {
  it('should include games played as a guest before signing in', async () => {
    const guestId = getGuestId();
    saveGameHistory([wonGame('as-guest', guestId), wonGame('signed-in', 'user-1')]);
    mockUser('user-1');

    render(<StatsPage />);

    expect(await screen.findByText('Your Statistics')).toBeInTheDocument();
    expect(statValue('Total')).toBe('2');
    expect(statValue('Wins')).toBe('2');
  });

  it('should leave abandoned games out', async () => {
    const guestId = getGuestId();
    saveGameHistory([wonGame('won', guestId), wonGame('ended', guestId, 'abandoned')]);
    mockUser(null);

    render(<StatsPage />);

    expect(await screen.findByText('Your Statistics')).toBeInTheDocument();
    expect(statValue('Total')).toBe('1');
    expect(statValue('Losses')).toBe('0');
  });

  it('should still show guest stats when Supabase cannot be reached', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    saveGameHistory([wonGame('won', getGuestId())]);
    mockCreateClient.mockImplementation(() => {
      throw new Error('Missing Supabase env');
    });

    render(<StatsPage />);

    expect(await screen.findByText('Your Statistics')).toBeInTheDocument();
    expect(statValue('Total')).toBe('1');
  });
});
