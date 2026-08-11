/**
 * Tests for the achievements client
 */

import {
  checkAchievementsForGame,
  getAchievementDefinition,
  getRarityColor,
  getRarityBgColor,
  getTotalAchievementCount,
  getAchievementProgress,
} from '../achievements';
import { createClient } from '@/lib/supabase/client';
import { ACHIEVEMENTS, Game, DEFAULT_RULESET, Player } from '../types';

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

/** Minimal stand-in for the pieces of the Supabase client this module touches */
function mockSupabase({
  userId,
  rpcData,
  rpcError,
}: {
  userId: string | null;
  rpcData?: Array<{ achievement_type: string; is_new: boolean }>;
  rpcError?: { message: string };
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: rpcData ?? [],
    error: rpcError ?? null,
  });
  mockedCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    rpc,
  } as unknown as ReturnType<typeof createClient>);
  return { rpc };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'winner-id',
    name: 'Winner',
    avatar: '🎱',
    lives: 3,
    eliminated: false,
    userId: 'user-1',
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
    status: 'completed',
    players: [
      makePlayer(),
      makePlayer({ id: 'loser-id', name: 'Loser', lives: 0, eliminated: true, userId: null }),
    ],
    currentPlayerIndex: 0,
    winnerId: 'winner-id',
    ruleset: DEFAULT_RULESET,
    history: [],
    ...overrides,
  };
}

describe('checkAchievementsForGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not call the RPC for a game that is not completed', async () => {
    const { rpc } = mockSupabase({ userId: 'user-1' });

    expect(await checkAchievementsForGame(makeGame({ status: 'active' }))).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should not call the RPC when there is no winner', async () => {
    const { rpc } = mockSupabase({ userId: 'user-1' });

    expect(await checkAchievementsForGame(makeGame({ winnerId: null }))).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should grant nothing when the winner is a guest', async () => {
    // Only the creator carries a userId, so a guest winner has none
    const game = makeGame({ players: [makePlayer({ userId: null })] });
    const { rpc } = mockSupabase({ userId: 'user-1' });

    expect(await checkAchievementsForGame(game)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should grant nothing when somebody else won', async () => {
    const { rpc } = mockSupabase({ userId: 'another-user' });

    expect(await checkAchievementsForGame(makeGame())).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should grant nothing when nobody is signed in', async () => {
    const { rpc } = mockSupabase({ userId: null });

    expect(await checkAchievementsForGame(makeGame())).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should return only newly unlocked achievements for the winner', async () => {
    const { rpc } = mockSupabase({
      userId: 'user-1',
      rpcData: [
        { achievement_type: 'first_win', is_new: true },
        { achievement_type: 'survivor', is_new: false },
      ],
    });

    expect(await checkAchievementsForGame(makeGame())).toEqual(['first_win']);
    expect(rpc).toHaveBeenCalledWith('check_achievements', {
      p_user_id: 'user-1',
      p_game_id: 'game-1',
    });
  });

  it('should swallow RPC errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSupabase({ userId: 'user-1', rpcError: { message: 'boom' } });

    expect(await checkAchievementsForGame(makeGame())).toEqual([]);

    consoleErrorSpy.mockRestore();
  });
});

describe('achievement helpers', () => {
  it('should look a definition up by type', () => {
    expect(getAchievementDefinition('first_win')?.name).toBe('First Blood');
    expect(getAchievementDefinition('nope' as never)).toBeUndefined();
  });

  it('should report the number of achievement types', () => {
    // Pinned: the README and the SQL in check_achievements both have to agree
    expect(getTotalAchievementCount()).toBe(10);
    expect(ACHIEVEMENTS).toHaveLength(10);
  });

  it('should have a unique id for every achievement', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should calculate progress as a percentage', () => {
    expect(getAchievementProgress(0)).toBe(0);
    expect(getAchievementProgress(5)).toBe(50);
    expect(getAchievementProgress(10)).toBe(100);
  });

  it('should return a colour for every rarity', () => {
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      expect(getRarityColor(rarity)).toBeTruthy();
      expect(getRarityBgColor(rarity)).toBeTruthy();
    }
  });
});
