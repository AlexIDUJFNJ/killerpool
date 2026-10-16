/**
 * Tests for LeaderboardList loading, errors and retry
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaderboardList } from '../leaderboard-list';
import { createClient } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const rows = [
  {
    player_id: 'a',
    display_name: 'Ann Lee',
    avatar_url: null,
    total_games: 5,
    games_won: 4,
    games_lost: 1,
    win_rate: 80,
    total_actions: 40,
    total_black_pots: 2,
    rank: 1,
  },
  {
    player_id: 'b',
    display_name: 'Bob',
    avatar_url: null,
    total_games: 5,
    games_won: 2,
    games_lost: 3,
    win_rate: 40,
    total_actions: 30,
    total_black_pots: 1,
    rank: 2,
  },
];

function mockClient(rpc: jest.Mock) {
  mockCreateClient.mockReturnValue({
    rpc,
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  } as unknown as ReturnType<typeof createClient>);
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LeaderboardList', () => {
  it('should list the players in rank order', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockClient(rpc);

    render(<LeaderboardList limit={15} />);

    const list = await screen.findByRole('list', { name: 'Leaderboard' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('get_leaderboard', { limit_count: 15 });
    // No placeholder podium heading above the list any more
    expect(screen.queryByText('Top Players')).not.toBeInTheDocument();
  });

  it('should show a friendly error instead of the raw database message, and retry', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'function get_leaderboard(integer) does not exist' } })
      .mockResolvedValueOnce({ data: rows, error: null });
    mockClient(rpc);
    const user = userEvent.setup();

    render(<LeaderboardList />);

    expect(await screen.findByText("Couldn't load the leaderboard")).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Ann Lee')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('should load again when the limit changes', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockClient(rpc);

    const { rerender } = render(<LeaderboardList limit={15} />);
    await screen.findByText('Ann Lee');
    rerender(<LeaderboardList limit={5} />);

    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('get_leaderboard', { limit_count: 5 }));
  });
});
