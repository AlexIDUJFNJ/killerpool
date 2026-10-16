/**
 * Tests for GameProvider — the state machine that ties the game to storage,
 * sync and achievements. Every bug fixed in this file so far lived here while
 * the rest of the suite stayed green.
 */

import * as React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { GameProvider, useGame } from '../game-context';
import { createGame, applyAction, MAX_PLAYERS } from '@/lib/game-logic';
import {
  loadGameHistory,
  saveCurrentGame,
  loadCurrentGame,
  saveToHistory,
  markCurrentGameShared,
  isCurrentGameShared,
} from '@/lib/storage';
import { syncFinishedGame, syncActiveGameToSupabase } from '@/lib/sync';
import { checkAchievementsForGame } from '@/lib/achievements';
import { subscribeToGame } from '@/lib/realtime';
import { mapGameToDbRow } from '@/lib/game-mapper';
import { Game } from '@/lib/types';

const mockSingle = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
    })),
  })),
}));

jest.mock('@/lib/sync', () => ({
  syncFinishedGame: jest.fn().mockResolvedValue({ ok: true }),
  syncActiveGameToSupabase: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/achievements', () => ({
  checkAchievementsForGame: jest.fn().mockResolvedValue([]),
  onUnlockedAchievements: jest.fn(() => () => {}),
}));

// The real useRealtimeGame runs; only the channel underneath is faked
jest.mock('@/lib/realtime', () => ({
  subscribeToGame: jest.fn(() => ({ id: 'channel' })),
  unsubscribeFromGame: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/components/achievements/achievement-toast', () => ({
  AchievementToasts: () => null,
}));

const mockedSyncFinished = syncFinishedGame as jest.Mock;
const mockedSyncActive = syncActiveGameToSupabase as jest.Mock;
const mockedSubscribe = subscribeToGame as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GameProvider>{children}</GameProvider>
);

/** Play until somebody wins, forcing the same player to keep shooting */
function playToCompletion(start: Game, loserIndex: number): Game {
  let game = start;
  for (let i = 0; i < 3; i++) {
    game = { ...game, currentPlayerIndex: loserIndex };
    game = applyAction(game, 'miss');
  }
  return game;
}

function twoPlayerGame(): Game {
  return createGame([
    { name: 'Player 1', avatar: '🎱' },
    { name: 'Player 2', avatar: '🎯' },
  ]);
}

/** A shared game one shot from the end: Player 2 is on their last life */
function oneShotFromTheEnd(): Game {
  let game = twoPlayerGame();
  game = applyAction({ ...game, currentPlayerIndex: 1 }, 'miss');
  game = applyAction({ ...game, currentPlayerIndex: 1 }, 'miss');
  return { ...game, currentPlayerIndex: 1 };
}

async function renderProvider() {
  const view = renderHook(() => useGame(), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

/** Calls of syncActiveGameToSupabase, as history lengths */
const liveWrites = () => mockedSyncActive.mock.calls.map(([g]: [Game]) => g.history.length);

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncFinished.mockResolvedValue({ ok: true });
  mockedSyncActive.mockResolvedValue({ ok: true });
});

describe('GameProvider', () => {
  it('should restore an active game from localStorage on mount', async () => {
    const game = twoPlayerGame();
    saveCurrentGame(game);

    const { result } = await renderProvider();

    expect(result.current.game?.id).toBe(game.id);
  });

  it('should persist every action', async () => {
    const { result } = await renderProvider();

    act(() => result.current.startGame(twoPlayerGame()));
    act(() => result.current.performAction('miss'));

    expect(loadCurrentGame()?.history).toHaveLength(1);
  });

  it('should not write to Supabase while sharing is off', async () => {
    const { result } = await renderProvider();

    act(() => result.current.startGame(twoPlayerGame()));
    act(() => result.current.performAction('miss'));

    expect(syncActiveGameToSupabase).not.toHaveBeenCalled();
  });

  it('should run the completion pipeline exactly once', async () => {
    const { result } = await renderProvider();

    const game = twoPlayerGame();
    act(() => result.current.startGame(game));
    act(() => result.current.startGame(playToCompletion(game, 1)));

    await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));
    expect(loadGameHistory()).toHaveLength(1);
  });

  it('should process a second completion after an undo', async () => {
    // The guard used to be a set of game ids that was never cleared, so undoing
    // a win and playing on saved nothing: history, Supabase and achievements
    // all kept the result that had been taken back
    const { result } = await renderProvider();

    const game = twoPlayerGame();
    const finished = playToCompletion(game, 1);
    act(() => result.current.startGame(finished));
    await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));

    act(() => result.current.undoAction());
    expect(result.current.game?.status).toBe('active');

    // Play on to the other winner
    act(() => result.current.startGame(playToCompletion(result.current.game!, 0)));

    await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(2));
    const winners = mockedSyncFinished.mock.calls.map(([g]: [Game]) => g.winnerId);
    expect(winners[0]).not.toBe(winners[1]);
  });

  it('should take an uploaded win back from Supabase when it is undone', async () => {
    // Otherwise the leaderboard keeps a result that no longer stands
    const { result } = await renderProvider();

    act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));
    await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));

    act(() => result.current.undoAction());

    expect(mockedSyncActive).toHaveBeenCalledTimes(1);
    expect(mockedSyncActive.mock.calls[0][0].status).toBe('active');
  });

  it('should grant achievements only after a successful sync', async () => {
    mockedSyncFinished.mockResolvedValueOnce({ ok: false, failure: 'retry', message: 'offline' });
    const { result } = await renderProvider();

    act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));

    await waitFor(() => expect(syncFinishedGame).toHaveBeenCalled());
    expect(checkAchievementsForGame).not.toHaveBeenCalled();
  });

  it('should surface unlocked achievements and drain them one at a time', async () => {
    (checkAchievementsForGame as jest.Mock).mockResolvedValueOnce(['first_win', 'survivor']);
    const { result } = await renderProvider();

    act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));

    await waitFor(() => expect(result.current.newAchievements).toHaveLength(2));
    act(() => result.current.dismissAchievement());
    expect(result.current.newAchievements).toEqual(['survivor']);
  });

  it('should refuse actions on a finished game', async () => {
    const { result } = await renderProvider();

    const finished = playToCompletion(twoPlayerGame(), 1);
    act(() => result.current.startGame(finished));

    const before = result.current.game
    act(() => result.current.performAction('miss'));

    // Unchanged: without this guard the last survivor could miss down to zero,
    // clearing the winner and reopening a game nobody is left to play
    expect(result.current.game).toBe(before);
    await waitFor(() => expect(result.current.resultSync).toBe('saved'));
  });

  describe('result upload state', () => {
    it('should say the result is saving until the upload answers, then saved', async () => {
      let finish!: (outcome: unknown) => void;
      mockedSyncFinished.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
      const { result } = await renderProvider();

      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));
      expect(result.current.resultSync).toBe('saving');

      await act(async () => finish({ ok: true }));
      expect(result.current.resultSync).toBe('saved');
    });

    it('should report a failed upload as queued for retry', async () => {
      mockedSyncFinished.mockResolvedValueOnce({ ok: false, failure: 'retry', message: 'offline' });
      const { result } = await renderProvider();

      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));

      await waitFor(() => expect(result.current.resultSync).toBe('retrying'));
    });

    it('should report a game of another account as such', async () => {
      mockedSyncFinished.mockResolvedValueOnce({ ok: false, failure: 'other-account', message: '' });
      const { result } = await renderProvider();

      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));

      await waitFor(() => expect(result.current.resultSync).toBe('other-account'));
    });

    it('should not carry the outcome of an undone win over to the next one', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));
      await waitFor(() => expect(result.current.resultSync).toBe('saved'));

      act(() => result.current.undoAction());
      expect(result.current.resultSync).toBeNull();

      mockedSyncFinished.mockReturnValueOnce(new Promise(() => {}));
      act(() => result.current.startGame(playToCompletion(result.current.game!, 0)));
      expect(result.current.resultSync).toBe('saving');
    });
  });

  describe('abandoned games', () => {
    it('should keep a game ended early in history as abandoned', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));
      act(() => result.current.performAction('miss'));

      act(() => result.current.endGame());

      const history = loadGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('abandoned');
      expect(history[0].history).toHaveLength(1);
      expect(result.current.game).toBeNull();
      expect(loadCurrentGame()).toBeNull();
    });

    it('should keep an abandoned game that never left the device local', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));
      act(() => result.current.performAction('miss'));

      act(() => result.current.endGame());

      expect(syncFinishedGame).not.toHaveBeenCalled();
      expect(checkAchievementsForGame).not.toHaveBeenCalled();
    });

    it('should tell spectators that a shared game was abandoned', async () => {
      // The row stayed 'active' and spectators watched a game that never ended
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));
      await act(async () => {
        await result.current.enableSharing();
      });
      act(() => result.current.performAction('miss'));

      act(() => result.current.endGame());

      expect(syncFinishedGame).toHaveBeenCalledTimes(1);
      expect(mockedSyncFinished.mock.calls[0][0].status).toBe('abandoned');
      expect(result.current.isSharingEnabled).toBe(false);
    });

    it('should mark an uploaded win that was undone as abandoned in Supabase', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));
      await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));
      act(() => result.current.undoAction());

      act(() => result.current.endGame());

      expect(syncFinishedGame).toHaveBeenCalledTimes(2);
      expect(mockedSyncFinished.mock.calls[1][0].status).toBe('abandoned');
      expect(loadGameHistory().map(g => g.status)).toEqual(['abandoned']);
    });

    it('should abandon a running game that a new one replaces', async () => {
      const { result } = await renderProvider();
      const first = twoPlayerGame();
      act(() => result.current.startGame(first));
      act(() => result.current.performAction('miss'));

      act(() => result.current.startGame(twoPlayerGame()));

      expect(loadGameHistory().map(g => [g.id, g.status])).toEqual([[first.id, 'abandoned']]);
    });

    it('should not keep a game in which nothing happened', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));

      act(() => result.current.startGame(twoPlayerGame()));

      expect(loadGameHistory()).toEqual([]);
    });

    it('should leave a finished game as it is when moving on', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(playToCompletion(twoPlayerGame(), 1)));
      await waitFor(() => expect(result.current.resultSync).toBe('saved'));

      act(() => result.current.endGame());

      expect(loadGameHistory().map(g => g.status)).toEqual(['completed']);
    });
  });

  describe('spectator mode', () => {
    it('should keep a spectator from touching their own saved game', async () => {
      const own = twoPlayerGame();
      saveCurrentGame(own);
      const { result } = await renderProvider();

      act(() => result.current.setSpectatorGame(twoPlayerGame()));
      act(() => result.current.endGame());

      expect(result.current.isSpectatorMode).toBe(true);
      expect(loadCurrentGame()?.id).toBe(own.id);
    });

    it('should not persist a spectated game', async () => {
      const { result } = await renderProvider();

      act(() => result.current.setSpectatorGame(twoPlayerGame()));

      expect(loadCurrentGame()).toBeNull();
    });

    it('should follow the spectated game live', async () => {
      const { result } = await renderProvider();
      const watched = twoPlayerGame();

      act(() => result.current.setSpectatorGame(watched));

      expect(mockedSubscribe).toHaveBeenCalledTimes(1);
      expect(mockedSubscribe.mock.calls[0][0]).toBe(watched.id);

      const [, onUpdate] = mockedSubscribe.mock.calls[0];
      const next = applyAction(watched, 'miss');
      act(() => onUpdate(next));

      expect(result.current.game).toEqual(next);
    });

    it('should ignore an update that belongs to another game', async () => {
      const { result } = await renderProvider();
      const watched = twoPlayerGame();
      act(() => result.current.setSpectatorGame(watched));

      const [, onUpdate] = mockedSubscribe.mock.calls[0];
      act(() => onUpdate(twoPlayerGame()));

      expect(result.current.game?.id).toBe(watched.id);
    });

    it('should catch up on moves missed before the channel came up', async () => {
      const { result } = await renderProvider();
      const watched = twoPlayerGame();
      const meanwhile = applyAction(watched, 'miss');
      mockSingle.mockResolvedValueOnce({ data: mapGameToDbRow(meanwhile, null), error: null });

      act(() => result.current.setSpectatorGame(watched));
      const [, , onStatus] = mockedSubscribe.mock.calls[0];
      act(() => onStatus(true));

      await waitFor(() => expect(result.current.game?.history).toHaveLength(1));
    });

    it('should not let a catch-up fetch overwrite a newer realtime update', async () => {
      const { result } = await renderProvider();
      const watched = twoPlayerGame();
      let respond!: (value: unknown) => void;
      mockSingle.mockReturnValueOnce(new Promise(resolve => (respond = resolve)));

      act(() => result.current.setSpectatorGame(watched));
      const [, onUpdate, onStatus] = mockedSubscribe.mock.calls[0];
      act(() => onStatus(true));

      const two = applyAction(applyAction(watched, 'miss'), 'miss');
      act(() => onUpdate(two));
      await act(async () => respond({ data: mapGameToDbRow(watched, null), error: null }));

      expect(result.current.game?.history).toHaveLength(2);
    });

    it('should give the viewer their own game back when they stop watching', async () => {
      // Watching replaced it in memory, and it stayed gone until a reload
      const own = twoPlayerGame();
      saveCurrentGame(own);
      const { result } = await renderProvider();

      act(() => result.current.setSpectatorGame(twoPlayerGame()));
      act(() => result.current.clearSpectatorGame());

      expect(result.current.isSpectatorMode).toBe(false);
      expect(result.current.game?.id).toBe(own.id);
    });
  });

  describe('sharing', () => {
    it('should sync each action once sharing is enabled', async () => {
      const { result } = await renderProvider();

      act(() => result.current.startGame(twoPlayerGame()));
      await act(async () => {
        await result.current.enableSharing();
      });

      act(() => result.current.performAction('miss'));

      expect(liveWrites()).toEqual([0, 1]);
    });

    it('should hand every state to the writer in the order it happened', async () => {
      // lib/sync.ts keeps them in that order on the wire
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));
      await act(async () => {
        await result.current.enableSharing();
      });

      act(() => result.current.performAction('miss'));
      act(() => result.current.performAction('pot'));
      act(() => result.current.undoAction());
      act(() => result.current.performAction('pot_black'));

      expect(liveWrites()).toEqual([0, 1, 2, 1, 2]);
    });

    it('should not subscribe the host to its own game', async () => {
      // The echo of the host's own write for shot N used to arrive after shot
      // N+1 and be merged over it, rolling the game back a move
      const { result } = await renderProvider();
      act(() => result.current.startGame(twoPlayerGame()));
      await act(async () => {
        await result.current.enableSharing();
      });

      act(() => result.current.performAction('miss'));
      act(() => result.current.performAction('miss'));

      expect(subscribeToGame).not.toHaveBeenCalled();
      expect(result.current.game?.history).toHaveLength(2);
    });

    it('should keep sharing across a reload', async () => {
      // Sharing lived only in memory: after F5 the host played on, nothing
      // reached Supabase, and spectators froze on the last move
      const first = await renderProvider();
      const game = twoPlayerGame();
      act(() => first.result.current.startGame(game));
      await act(async () => {
        await first.result.current.enableSharing();
      });
      act(() => first.result.current.performAction('miss'));
      first.unmount();
      jest.clearAllMocks();

      const { result } = await renderProvider();

      expect(result.current.game?.id).toBe(game.id);
      expect(result.current.isSharingEnabled).toBe(true);
      // The restored state goes out again, in case the reload cut its write off
      expect(liveWrites()).toEqual([1]);

      act(() => result.current.performAction('miss'));
      expect(liveWrites()).toEqual([1, 2]);
    });

    it('should not restore sharing for a game that was never shared', async () => {
      const shared = twoPlayerGame();
      markCurrentGameShared(shared.id);
      saveCurrentGame(twoPlayerGame());

      const { result } = await renderProvider();

      expect(result.current.isSharingEnabled).toBe(false);
      expect(syncActiveGameToSupabase).not.toHaveBeenCalled();
    });

    it('should not start sharing when the first upload fails', async () => {
      mockedSyncActive.mockResolvedValueOnce({ ok: false, failure: 'retry', message: 'offline' });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = await renderProvider();
      const game = twoPlayerGame();
      act(() => result.current.startGame(game));

      let shared = true;
      await act(async () => {
        shared = await result.current.enableSharing();
      });

      expect(shared).toBe(false);
      expect(result.current.isSharingEnabled).toBe(false);
      expect(isCurrentGameShared(game.id)).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should tell spectators when a shared game ends', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(oneShotFromTheEnd()));
      await act(async () => {
        await result.current.enableSharing();
      });

      act(() => result.current.performAction('miss'));

      // The completed state goes out once, through the queued final upload
      await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));
      expect(mockedSyncFinished.mock.calls[0][0].status).toBe('completed');
      expect(mockedSyncActive.mock.calls.every(([g]: [Game]) => g.status === 'active')).toBe(true);
    });

    it('should not write an undone win twice while sharing', async () => {
      const { result } = await renderProvider();
      act(() => result.current.startGame(oneShotFromTheEnd()));
      await act(async () => {
        await result.current.enableSharing();
      });
      act(() => result.current.performAction('miss'));
      await waitFor(() => expect(syncFinishedGame).toHaveBeenCalledTimes(1));
      mockedSyncActive.mockClear();

      act(() => result.current.undoAction());

      expect(mockedSyncActive).toHaveBeenCalledTimes(1);
    });

    it('should reset sharing and spectator mode when a new game starts', async () => {
      const { result } = await renderProvider();

      act(() => result.current.setSpectatorGame(twoPlayerGame()));
      act(() => result.current.startGame(twoPlayerGame()));

      expect(result.current.isSpectatorMode).toBe(false);
      expect(result.current.isSharingEnabled).toBe(false);
    });
  });

  it('should keep a shared game abandoned before a reload out of the queue of finished games', async () => {
    // A completed copy in history is what tells endGame a game reached Supabase
    const game = playToCompletion(twoPlayerGame(), 1);
    saveToHistory(game);
    saveCurrentGame({ ...game, status: 'active', winnerId: undefined });
    const { result } = await renderProvider();

    act(() => result.current.endGame());

    expect(mockedSyncFinished.mock.calls[0][0].status).toBe('abandoned');
  });

  it('should leave a full game as it is when another player is added', async () => {
    // The database refuses a game above the limit for good, so the game must
    // never get there, whatever the screen offers
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const full = createGame(
      Array.from({ length: MAX_PLAYERS }, (_, i) => ({ name: `Player ${i + 1}`, avatar: '🎱' }))
    );
    const { result } = await renderProvider();
    act(() => result.current.startGame(full));

    act(() => result.current.addPlayer('One more', '🎲'));

    expect(result.current.game?.players).toHaveLength(MAX_PLAYERS);
    expect(loadCurrentGame()?.players).toHaveLength(MAX_PLAYERS);
    consoleErrorSpy.mockRestore();
  });

  it('should throw when used outside the provider', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => renderHook(() => useGame())).toThrow('useGame must be used within a GameProvider');

    consoleErrorSpy.mockRestore();
  });
});
