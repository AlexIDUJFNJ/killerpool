/**
 * Tests for the Supabase sync layer
 */

import {
  syncGameToSupabase,
  syncAllGamesToSupabase,
  autoSyncGame,
  retryPendingSyncs,
  mergeGamesWithSupabase,
} from '../sync';
import { createClient } from '@/lib/supabase/client';
import {
  saveToHistory,
  loadGameHistory,
  getPendingSyncIds,
  markGameDeleted,
  recordSyncFailure,
  MAX_SYNC_ATTEMPTS,
} from '../storage';
import { createGame } from '../game-logic';
import { Game } from '../types';

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

jest.mock('../achievements', () => ({
  checkAchievementsForGame: jest.fn().mockResolvedValue([]),
  emitUnlockedAchievements: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

interface MockOptions {
  userId?: string | null;
  /** Error returned by the games upsert */
  upsertError?: { message: string; code?: string } | null;
  /** Rows returned when reading games back */
  remoteGames?: unknown[];
}

function mockSupabase({ userId = null, upsertError = null, remoteGames = [] }: MockOptions = {}) {
  const gamesUpsert = jest.fn().mockResolvedValue({ error: upsertError });
  const profilesUpsert = jest.fn().mockResolvedValue({ error: null });

  const gamesSelect = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: remoteGames, error: null }),
  };

  const from = jest.fn((table: string) => {
    if (table === 'player_profiles') return { upsert: profilesUpsert };
    return { upsert: gamesUpsert, ...gamesSelect };
  });

  mockedCreateClient.mockReturnValue({
    from,
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId, email: 'player@example.com' } : null },
      }),
    },
  } as unknown as ReturnType<typeof createClient>);

  return { gamesUpsert, profilesUpsert, from };
}

function completedGame(id: string): Game {
  const game = createGame([
    { name: 'Player 1', avatar: '🎱' },
    { name: 'Player 2', avatar: '🎯' },
  ]);
  return { ...game, id, status: 'completed', winnerId: game.players[0].id };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('syncGameToSupabase', () => {
  it('should refuse anything that is not completed', async () => {
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const game = { ...completedGame('game-1'), status: 'active' as const };
    expect(await syncGameToSupabase(game)).toBe(false);
    expect(gamesUpsert).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should upsert the mapped row keyed on id', async () => {
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });
    const game = completedGame('game-1');

    expect(await syncGameToSupabase(game)).toBe(true);

    const [row, options] = gamesUpsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'id' });
    expect(row).toMatchObject({
      id: 'game-1',
      status: 'completed',
      created_by: 'user-1',
      winner_id: game.players[0].id,
    });
  });

  it('should always send the same set of columns', async () => {
    // PostgREST builds ON CONFLICT DO UPDATE from the payload keys, so a
    // varying shape means a varying upsert
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await syncGameToSupabase(completedGame('game-1'));

    expect(Object.keys(gamesUpsert.mock.calls[0][0]).sort()).toEqual([
      'created_at',
      'created_by',
      'current_player_index',
      'history',
      'id',
      'participants',
      'ruleset_id',
      'status',
      'updated_at',
      'winner_id',
    ]);
  });

  it('should leave ruleset_id null for the non-UUID default ruleset', async () => {
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await syncGameToSupabase(completedGame('game-1'));

    expect(gamesUpsert.mock.calls[0][0].ruleset_id).toBeNull();
  });

  it('should write a null owner for a guest', async () => {
    const { gamesUpsert, profilesUpsert } = mockSupabase({ userId: null });

    await syncGameToSupabase(completedGame('game-1'));

    expect(gamesUpsert.mock.calls[0][0].created_by).toBeNull();
    // No account, no profile to create
    expect(profilesUpsert).not.toHaveBeenCalled();
  });

  it('should create the profile without overwriting a custom name', async () => {
    const { profilesUpsert } = mockSupabase({ userId: 'user-1' });

    await syncGameToSupabase(completedGame('game-1'));

    expect(profilesUpsert).toHaveBeenCalledWith(
      { user_id: 'user-1', display_name: 'player' },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  });

  it('should report failure when the upsert is rejected', async () => {
    mockSupabase({ userId: 'user-1', upsertError: { message: 'nope', code: '42501' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await syncGameToSupabase(completedGame('game-1'))).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});

describe('autoSyncGame', () => {
  it('should queue a failed game for retry', async () => {
    mockSupabase({ userId: 'user-1', upsertError: { message: 'offline' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await autoSyncGame(completedGame('game-1'))).toBe(false);
    expect(getPendingSyncIds()).toContain('game-1');

    consoleErrorSpy.mockRestore();
  });

  it('should drop a game from the queue once it succeeds', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSupabase({ userId: 'user-1', upsertError: { message: 'offline' } });
    await autoSyncGame(completedGame('game-1'));

    mockSupabase({ userId: 'user-1' });
    expect(await autoSyncGame(completedGame('game-1'))).toBe(true);
    expect(getPendingSyncIds()).not.toContain('game-1');

    consoleErrorSpy.mockRestore();
  });
});

describe('syncAllGamesToSupabase', () => {
  it('should count unfinished games as skipped rather than failed', async () => {
    // This is what made the page report "Failed: N" to anyone with an
    // abandoned game: only completed games can be uploaded at all
    const done = completedGame('game-1');
    saveToHistory(done);
    const abandoned = { ...completedGame('game-2'), status: 'abandoned' as const };
    localStorage.setItem(
      'killerpool_game_history',
      JSON.stringify([done, abandoned, { ...completedGame('game-3'), status: 'active' }])
    );
    mockSupabase({ userId: 'user-1' });

    expect(await syncAllGamesToSupabase()).toEqual({
      success: 1,
      skipped: 2,
      failed: 1 - 1,
      total: 3,
    });
  });
});

describe('mergeGamesWithSupabase', () => {
  it('should not bring back a game the user deleted', async () => {
    const remote = {
      id: 'game-1',
      created_at: new Date().toISOString(),
      updated_at: new Date(Date.now() + 10_000).toISOString(),
      status: 'completed',
      participants: [],
      winner_id: null,
      ruleset_id: null,
      history: [],
      created_by: 'user-1',
    };
    markGameDeleted('game-1');
    mockSupabase({ userId: 'user-1', remoteGames: [remote] });

    await mergeGamesWithSupabase();

    expect(loadGameHistory().find(g => g.id === 'game-1')).toBeUndefined();
  });

  it('should pull down a game that was never deleted', async () => {
    const remote = {
      id: 'game-9',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'completed',
      participants: [],
      winner_id: null,
      ruleset_id: null,
      history: [],
      created_by: 'user-1',
    };
    mockSupabase({ userId: 'user-1', remoteGames: [remote] });

    await mergeGamesWithSupabase();

    expect(loadGameHistory().find(g => g.id === 'game-9')).toBeDefined();
  });
});

describe('retryPendingSyncs', () => {
  it('should do nothing while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
  });

  it('should drop ids whose game is no longer in history', async () => {
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['gone']));

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should give up on a permanently refused game instead of retrying forever', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    recordSyncFailure('game-1', { permanent: true });
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);

    consoleWarnSpy.mockRestore();
  });

  it('should give up after too many attempts', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) recordSyncFailure('game-1');
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should hold off on a game that just failed', async () => {
    // Otherwise every tab switch fires a request for every queued game
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    recordSyncFailure('game-1');
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
  });

  it('should sync a queued game and announce its achievements', async () => {
    const { emitUnlockedAchievements, checkAchievementsForGame } = jest.requireMock('../achievements');
    (checkAchievementsForGame as jest.Mock).mockResolvedValue(['first_win']);
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    const { gamesUpsert } = mockSupabase({ userId: 'user-1' });

    await retryPendingSyncs();

    expect(gamesUpsert).toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);
    // PWAInit sits outside GameProvider, so the toast travels as an event
    expect(emitUnlockedAchievements).toHaveBeenCalledWith(['first_win']);
  });
});
