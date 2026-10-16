/**
 * Tests for the Supabase sync layer
 */

import {
  syncFinishedGame,
  syncActiveGameToSupabase,
  syncAllGamesToSupabase,
  retryPendingSyncs,
  mergeGamesWithSupabase,
} from '../sync';
import { createClient } from '@/lib/supabase/client';
import {
  saveToHistory,
  saveCurrentGame,
  loadGameHistory,
  getGuestId,
  getPendingSyncIds,
  markPendingSync,
  markGameDeleted,
  recordSyncFailure,
  isSyncBackedOff,
  MAX_SYNC_AGE_MS,
  BACKOFF_MAX_MS,
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

const USER_A = '0a0a0a0a-0000-4000-8000-00000000000a';
const USER_B = '0b0b0b0b-0000-4000-8000-00000000000b';

interface MockOptions {
  userId?: string | null;
  /** Error returned by auth.getUser */
  authError?: { message: string; name?: string; __isAuthError?: boolean } | null;
  /** Error returned by the games upsert */
  upsertError?: { message: string; code?: string } | null;
  /** Rows returned when reading games back */
  remoteGames?: unknown[];
}

function mockSupabase({
  userId = null,
  authError = null,
  upsertError = null,
  remoteGames = [],
}: MockOptions = {}) {
  const gamesUpsert = jest.fn().mockResolvedValue({ error: upsertError });
  const profilesUpsert = jest.fn().mockResolvedValue({ error: null });
  let authListener: ((event: string) => void) | null = null;

  const gamesSelect = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: remoteGames, error: null }),
  };

  const from = jest.fn((table: string) => {
    if (table === 'player_profiles') return { upsert: profilesUpsert };
    return { upsert: gamesUpsert, ...gamesSelect };
  });

  const auth = {
    getUser: jest.fn().mockResolvedValue({
      data: { user: userId ? { id: userId, email: 'player@example.com' } : null },
      error: authError,
    }),
    onAuthStateChange: jest.fn((callback: (event: string) => void) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  };

  mockedCreateClient.mockReturnValue({ from, auth } as unknown as ReturnType<typeof createClient>);

  return {
    gamesUpsert,
    profilesUpsert,
    from,
    auth,
    signInAs(id: string | null) {
      auth.getUser.mockResolvedValue({
        data: { user: id ? { id, email: 'player@example.com' } : null },
        error: null,
      });
      authListener?.(id ? 'SIGNED_IN' : 'SIGNED_OUT');
    },
  };
}

/** A promise whose settlement the test controls */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function completedGame(id: string, createdBy?: string | null): Game {
  const game = createGame([
    { name: 'Player 1', avatar: '🎱' },
    { name: 'Player 2', avatar: '🎯' },
  ]);
  return { ...game, id, status: 'completed', winnerId: game.players[0].id, createdBy };
}

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('syncFinishedGame', () => {
  it('should refuse a game that is still being played', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    const game = { ...completedGame('game-1'), status: 'active' as const };
    const result = await syncFinishedGame(game);

    expect(result).toMatchObject({ ok: false, failure: 'refused' });
    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should upload an abandoned game', async () => {
    // Spectators have to learn the game is over, or they watch it forever
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    const game = { ...completedGame('game-1', USER_A), status: 'abandoned' as const, winnerId: null };
    expect(await syncFinishedGame(game)).toEqual({ ok: true });

    expect(gamesUpsert.mock.calls[0][0]).toMatchObject({ status: 'abandoned', winner_id: null });
  });

  it('should upsert the mapped row keyed on id', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const game = completedGame('game-1', USER_A);

    expect(await syncFinishedGame(game)).toEqual({ ok: true });

    const [row, options] = gamesUpsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'id' });
    expect(row).toMatchObject({
      id: 'game-1',
      status: 'completed',
      created_by: USER_A,
      winner_id: game.players[0].id,
    });
  });

  it('should always send the same set of columns', async () => {
    // PostgREST builds ON CONFLICT DO UPDATE from the payload keys, so a
    // varying shape means a varying upsert
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1'));

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
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1'));

    expect(gamesUpsert.mock.calls[0][0].ruleset_id).toBeNull();
  });

  it('should create the profile without overwriting a custom name', async () => {
    const { profilesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1'));

    expect(profilesUpsert).toHaveBeenCalledWith(
      { user_id: USER_A, display_name: 'player' },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  });

  it('should queue the game before the attempt, not after it fails', async () => {
    // Closing the tab mid-request used to lose the game: it only joined the
    // queue once a failure came back
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const upsert = deferred<{ error: null }>();
    gamesUpsert.mockReturnValueOnce(upsert.promise);

    const pending = syncFinishedGame(completedGame('game-1'));
    await flush();

    expect(gamesUpsert).toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual(['game-1']);

    upsert.resolve({ error: null });
    expect(await pending).toEqual({ ok: true });
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should keep a game that failed for now queued for retry', async () => {
    mockSupabase({ userId: USER_A, upsertError: { message: 'offline' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await syncFinishedGame(completedGame('game-1'))).toMatchObject({
      ok: false,
      failure: 'retry',
    });
    expect(getPendingSyncIds()).toContain('game-1');

    consoleErrorSpy.mockRestore();
  });

  it('should drop a refused game from the queue straight away', async () => {
    mockSupabase({ userId: USER_A, upsertError: { message: 'denied', code: '42501' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await syncFinishedGame(completedGame('game-1'))).toMatchObject({ failure: 'refused' });
    expect(getPendingSyncIds()).toEqual([]);

    consoleErrorSpy.mockRestore();
  });

  it('should treat an unknown column as permanent', async () => {
    // PostgREST rejects an unknown payload key itself, with PGRST204 — the
    // 42703 that used to be listed never arrives for an upsert
    mockSupabase({
      userId: USER_A,
      upsertError: { message: "Could not find the 'x' column", code: 'PGRST204' },
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await syncFinishedGame(completedGame('game-1'))).toMatchObject({ failure: 'refused' });

    consoleErrorSpy.mockRestore();
  });

  it('should retry a server error', async () => {
    mockSupabase({ userId: USER_A, upsertError: { message: 'pool timeout', code: 'PGRST003' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(await syncFinishedGame(completedGame('game-1'))).toMatchObject({ failure: 'retry' });

    consoleErrorSpy.mockRestore();
  });
});

describe('who a game is written as', () => {
  it('should write a guest game of this device unowned while signed out', async () => {
    const { gamesUpsert, profilesUpsert } = mockSupabase({ userId: null });

    await syncFinishedGame(completedGame('game-1', getGuestId()));

    expect(gamesUpsert.mock.calls[0][0].created_by).toBeNull();
    // No account, no profile to create
    expect(profilesUpsert).not.toHaveBeenCalled();
  });

  it('should let the account adopt a guest game of this device on its first upload', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1', getGuestId()));

    expect(gamesUpsert.mock.calls[0][0].created_by).toBe(USER_A);
  });

  it('should treat a game with no recorded creator as this device\'s', async () => {
    // Older bundles left createdBy empty when nobody was marked "me"
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1', null));

    expect(gamesUpsert.mock.calls[0][0].created_by).toBe(USER_A);
  });

  it('should not write another account\'s game anonymously', async () => {
    // Created under A, synced after signing out: it used to go out unowned,
    // be refused by RLS, and leave the queue for good
    const { gamesUpsert } = mockSupabase({ userId: null });

    const result = await syncFinishedGame(completedGame('game-1', USER_A));

    expect(result).toMatchObject({ ok: false, failure: 'other-account' });
    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual(['game-1']);
  });

  it('should not write a game as a different account', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_B });

    const result = await syncFinishedGame(completedGame('game-1', USER_A));

    expect(result).toMatchObject({ failure: 'other-account' });
    expect(gamesUpsert).not.toHaveBeenCalled();
  });

  it('should write a game as its own account', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await syncFinishedGame(completedGame('game-1', USER_A));

    expect(gamesUpsert.mock.calls[0][0].created_by).toBe(USER_A);
  });

  it('should retry when getUser fails instead of writing the game as a guest\'s', async () => {
    // An unreachable auth server says nothing about who is signed in. Taken
    // for "nobody", the game went out unowned, RLS refused it with 42501 and
    // the refusal counted as permanent
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const { gamesUpsert } = mockSupabase({
      userId: null,
      authError: { message: 'Failed to fetch', name: 'AuthRetryableFetchError', __isAuthError: true },
    });

    const result = await syncFinishedGame(completedGame('game-1', USER_A));

    expect(result).toMatchObject({ ok: false, failure: 'retry' });
    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual(['game-1']);
    expect(isSyncBackedOff('game-1')).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it('should take a missing session for a guest, not for a failure', async () => {
    const { gamesUpsert } = mockSupabase({
      userId: null,
      authError: { message: 'Auth session missing!', name: 'AuthSessionMissingError', __isAuthError: true },
    });

    expect(await syncFinishedGame(completedGame('game-1', getGuestId()))).toEqual({ ok: true });
    expect(gamesUpsert.mock.calls[0][0].created_by).toBeNull();
  });

  it('should ask who is signed in once per session, not on every write', async () => {
    const { auth, profilesUpsert, gamesUpsert } = mockSupabase({ userId: USER_A });
    const game = { ...completedGame('game-1', USER_A), status: 'active' as const };

    await syncActiveGameToSupabase(game);
    await syncActiveGameToSupabase({ ...game, updatedAt: 'later' });
    await syncActiveGameToSupabase({ ...game, updatedAt: 'even later' });

    expect(gamesUpsert).toHaveBeenCalledTimes(3);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(profilesUpsert).toHaveBeenCalledTimes(1);
  });

  it('should ask again after a failed lookup', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const { auth } = mockSupabase({
      userId: USER_A,
      authError: { message: 'Failed to fetch', name: 'AuthRetryableFetchError', __isAuthError: true },
    });

    await syncFinishedGame(completedGame('game-1', USER_A));
    await syncFinishedGame(completedGame('game-1', USER_A));

    expect(auth.getUser).toHaveBeenCalledTimes(2);

    consoleErrorSpy.mockRestore();
  });

  it('should notice signing out between two writes', async () => {
    const supabase = mockSupabase({ userId: USER_A });
    const game = { ...completedGame('game-1', USER_A), status: 'active' as const };

    expect(await syncActiveGameToSupabase(game)).toEqual({ ok: true });
    supabase.signInAs(null);

    expect(await syncActiveGameToSupabase(game)).toMatchObject({ failure: 'other-account' });
    expect(supabase.gamesUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('write ordering', () => {
  function liveGame(historyLength: number): Game {
    const game = completedGame('live-1', USER_A);
    return {
      ...game,
      status: 'active',
      winnerId: undefined,
      updatedAt: `t${historyLength}`,
      history: Array.from({ length: historyLength }, (_, i) => ({
        id: `h${i}`,
        action: 'miss' as const,
        playerId: game.players[0].id,
        playerName: 'Player 1',
        timestamp: `t${i}`,
        livesBefore: 3,
        livesAfter: 2,
      })),
    };
  }

  it('should keep one write per game in flight and send only the newest waiting state', async () => {
    // Fire-and-forget upserts raced: the write for shot N could land after
    // the one for shot N+1 and leave the database a move behind
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const first = deferred<{ error: null }>();
    gamesUpsert.mockReturnValueOnce(first.promise);

    const results = [
      syncActiveGameToSupabase(liveGame(1)),
      syncActiveGameToSupabase(liveGame(2)),
      syncActiveGameToSupabase(liveGame(3)),
    ];
    await flush();

    // Nothing else starts while the first write is out
    expect(gamesUpsert).toHaveBeenCalledTimes(1);
    expect(gamesUpsert.mock.calls[0][0].history).toHaveLength(1);

    first.resolve({ error: null });
    expect(await Promise.all(results)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);

    // 2 was superseded by 3 before its turn came
    expect(gamesUpsert).toHaveBeenCalledTimes(2);
    expect(gamesUpsert.mock.calls[1][0].history).toHaveLength(3);
  });

  it('should order the final write after the live ones', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const first = deferred<{ error: null }>();
    gamesUpsert.mockReturnValueOnce(first.promise);

    const live = syncActiveGameToSupabase(liveGame(4));
    const finished = syncFinishedGame({ ...liveGame(5), status: 'abandoned' });
    await flush();
    first.resolve({ error: null });
    await Promise.all([live, finished]);

    expect(gamesUpsert.mock.calls.map(([row]) => row.status)).toEqual(['active', 'abandoned']);
  });

  it('should not hold up writes of a different game', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const stuck = deferred<{ error: null }>();
    gamesUpsert.mockReturnValueOnce(stuck.promise);

    const live = syncActiveGameToSupabase(liveGame(1));
    await syncFinishedGame(completedGame('other', USER_A));

    expect(gamesUpsert).toHaveBeenCalledTimes(2);
    stuck.resolve({ error: null });
    await live;
  });
});

describe('syncAllGamesToSupabase', () => {
  it('should count unfinished games as skipped rather than failed', async () => {
    // This is what made the page report "Failed: N" to anyone with an
    // abandoned game: only completed games can be uploaded at all
    const done = completedGame('game-1');
    const abandoned = { ...completedGame('game-2'), status: 'abandoned' as const };
    localStorage.setItem(
      'killerpool_game_history',
      JSON.stringify([done, abandoned, { ...completedGame('game-3'), status: 'active' }])
    );
    mockSupabase({ userId: USER_A });

    expect(await syncAllGamesToSupabase()).toEqual({
      success: 1,
      skipped: 2,
      refused: 0,
      failed: 0,
      otherAccount: 0,
      total: 3,
    });
  });

  it('should tell a refusal apart from a retryable failure', async () => {
    // A game played before signing in leaves an unowned row in Supabase, and
    // RLS will not let the account claim it. Retrying can never help, so it
    // must not be shown as an error the user should act on.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    localStorage.setItem('killerpool_game_history', JSON.stringify([completedGame('game-1')]));
    mockSupabase({ userId: USER_A, upsertError: { message: 'denied', code: '42501' } });

    expect(await syncAllGamesToSupabase()).toMatchObject({ refused: 1, failed: 0 });

    consoleErrorSpy.mockRestore();
  });

  it('should count games of another account separately', async () => {
    localStorage.setItem(
      'killerpool_game_history',
      JSON.stringify([completedGame('game-1', USER_A), completedGame('game-2', USER_B)])
    );
    mockSupabase({ userId: USER_B });

    expect(await syncAllGamesToSupabase()).toMatchObject({ success: 1, otherAccount: 1, failed: 0 });
    expect(getPendingSyncIds()).toEqual(['game-1']);
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
      created_by: USER_A,
    };
    markGameDeleted('game-1');
    mockSupabase({ userId: USER_A, remoteGames: [remote] });

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
      created_by: USER_A,
    };
    mockSupabase({ userId: USER_A, remoteGames: [remote] });

    await mergeGamesWithSupabase();

    expect(loadGameHistory().find(g => g.id === 'game-9')).toBeDefined();
  });
});

describe('retryPendingSyncs', () => {
  it('should do nothing while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
  });

  it('should drop ids whose game is no longer in history', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['gone']));

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should give up on a game an older bundle marked as refused', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    const now = Date.now();
    localStorage.setItem(
      'killerpool_pending_sync_meta',
      JSON.stringify({ 'game-1': { attempts: 1, firstFailedAt: now, lastAttemptAt: now, permanent: true } })
    );
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);

    consoleWarnSpy.mockRestore();
  });

  it('should keep retrying long after five failures', async () => {
    // The old cap of five attempts gave up after about fifteen minutes
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    const start = Date.now() - 3 * DAY;
    for (let i = 0; i < 12; i++) recordSyncFailure('game-1', start + i * BACKOFF_MAX_MS);
    // Last failure long enough ago for the capped backoff to have run out
    recordSyncFailure('game-1', Date.now() - BACKOFF_MAX_MS - 1000);
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).toHaveBeenCalledTimes(1);
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should give up once a game has been failing for two weeks', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    recordSyncFailure('game-1', Date.now() - MAX_SYNC_AGE_MS - 1000);
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);

    consoleWarnSpy.mockRestore();
  });

  it('should hold off on a game that just failed', async () => {
    // Otherwise every tab switch fires a request for every queued game
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    recordSyncFailure('game-1');
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
  });

  it('should sync a queued game and announce its achievements', async () => {
    const { emitUnlockedAchievements, checkAchievementsForGame } = jest.requireMock('../achievements');
    (checkAchievementsForGame as jest.Mock).mockResolvedValue(['first_win']);
    saveToHistory(completedGame('game-1'));
    localStorage.setItem('killerpool_pending_sync', JSON.stringify(['game-1']));
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual([]);
    // PWAInit sits outside GameProvider, so the toast travels as an event
    expect(emitUnlockedAchievements).toHaveBeenCalledWith(['first_win']);
  });

  it('should wait for the owner of a game to sign back in', async () => {
    saveToHistory(completedGame('game-1', USER_A));
    markPendingSync('game-1');
    const supabase = mockSupabase({ userId: null });

    await retryPendingSyncs();
    expect(supabase.gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual(['game-1']);
    // Nothing was sent, so nothing to back off from
    expect(isSyncBackedOff('game-1')).toBe(false);

    supabase.signInAs(USER_A);
    await retryPendingSyncs();

    expect(supabase.gamesUpsert).toHaveBeenCalledTimes(1);
    expect(supabase.gamesUpsert.mock.calls[0][0].created_by).toBe(USER_A);
    expect(getPendingSyncIds()).toEqual([]);
  });

  it('should leave alone a game that is being played again after an undo', async () => {
    // History still holds the win that was taken back; uploading it now would
    // put a result back that no longer stands
    const finished = completedGame('game-1');
    saveToHistory(finished);
    markPendingSync('game-1');
    saveCurrentGame({ ...finished, status: 'active', winnerId: undefined });
    const { gamesUpsert } = mockSupabase({ userId: USER_A });

    await retryPendingSyncs();

    expect(gamesUpsert).not.toHaveBeenCalled();
    expect(getPendingSyncIds()).toEqual(['game-1']);
  });

  it('should not send a second copy of a game whose first upload is still out', async () => {
    const { gamesUpsert } = mockSupabase({ userId: USER_A });
    const upsert = deferred<{ error: null }>();
    gamesUpsert.mockReturnValueOnce(upsert.promise);
    const game = completedGame('game-1');
    saveToHistory(game);

    const first = syncFinishedGame(game);
    await flush();
    await retryPendingSyncs();

    expect(gamesUpsert).toHaveBeenCalledTimes(1);
    upsert.resolve({ error: null });
    await first;
  });
});
