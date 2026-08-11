/**
 * Tests for GameProvider — the state machine that ties the game to storage,
 * sync and achievements. Every bug fixed in this file so far lived here while
 * the rest of the suite stayed green.
 */

import * as React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { GameProvider, useGame } from '../game-context';
import { createGame, applyAction } from '@/lib/game-logic';
import { loadGameHistory, saveCurrentGame, loadCurrentGame } from '@/lib/storage';
import { autoSyncGame, syncActiveGameToSupabase } from '@/lib/sync';
import { checkAchievementsForGame } from '@/lib/achievements';
import { updateGameStatus } from '@/lib/realtime';
import { Game } from '@/lib/types';

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn(),
  })),
}));

jest.mock('@/lib/sync', () => ({
  autoSyncGame: jest.fn().mockResolvedValue(true),
  syncActiveGameToSupabase: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/achievements', () => ({
  checkAchievementsForGame: jest.fn().mockResolvedValue([]),
  onUnlockedAchievements: jest.fn(() => () => {}),
}));

jest.mock('@/lib/realtime', () => ({
  updateGameStatus: jest.fn().mockResolvedValue(true),
  subscribeToGame: jest.fn(() => ({ id: 'channel' })),
  unsubscribeFromGame: jest.fn(),
}));

jest.mock('@/hooks/use-realtime-game', () => ({
  useRealtimeGame: () => ({ isConnected: false }),
  useSyncGameForRealtime: () => ({ isSynced: true }),
}));

jest.mock('@/components/achievements/achievement-toast', () => ({
  AchievementToasts: () => null,
}));

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GameProvider', () => {
  it('should restore an active game from localStorage on mount', async () => {
    const game = twoPlayerGame();
    saveCurrentGame(game);

    const { result } = renderHook(() => useGame(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.game?.id).toBe(game.id);
  });

  it('should persist every action', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.startGame(twoPlayerGame()));
    act(() => result.current.performAction('miss'));

    expect(loadCurrentGame()?.history).toHaveLength(1);
  });

  it('should not write to Supabase while sharing is off', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.startGame(twoPlayerGame()));
    act(() => result.current.performAction('miss'));

    expect(syncActiveGameToSupabase).not.toHaveBeenCalled();
  });

  it('should run the completion pipeline exactly once', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const game = twoPlayerGame();
    act(() => result.current.startGame(game));
    act(() => result.current.startGame(playToCompletion(game, 1)));

    await waitFor(() => expect(autoSyncGame).toHaveBeenCalledTimes(1));
    expect(loadGameHistory()).toHaveLength(1);
  });

  it('should process a second completion after an undo', async () => {
    // The guard used to be a set of game ids that was never cleared, so undoing
    // a win and playing on saved nothing: history, Supabase and achievements
    // all kept the result that had been taken back
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const game = twoPlayerGame();
    const finished = playToCompletion(game, 1);
    act(() => result.current.startGame(finished));
    await waitFor(() => expect(autoSyncGame).toHaveBeenCalledTimes(1));

    act(() => result.current.undoAction());
    expect(result.current.game?.status).toBe('active');

    // Play on to the other winner
    act(() => result.current.startGame(playToCompletion(result.current.game!, 0)));

    await waitFor(() => expect(autoSyncGame).toHaveBeenCalledTimes(2));
    const winners = (autoSyncGame as jest.Mock).mock.calls.map(([g]: [Game]) => g.winnerId);
    expect(winners[0]).not.toBe(winners[1]);
  });

  it('should grant achievements only after a successful sync', async () => {
    (autoSyncGame as jest.Mock).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const game = twoPlayerGame();
    act(() => result.current.startGame(playToCompletion(game, 1)));

    await waitFor(() => expect(autoSyncGame).toHaveBeenCalled());
    expect(checkAchievementsForGame).not.toHaveBeenCalled();
  });

  it('should surface unlocked achievements and drain them one at a time', async () => {
    (checkAchievementsForGame as jest.Mock).mockResolvedValue(['first_win', 'survivor']);
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const game = twoPlayerGame();
    act(() => result.current.startGame(playToCompletion(game, 1)));

    await waitFor(() => expect(result.current.newAchievements).toHaveLength(2));
    act(() => result.current.dismissAchievement());
    expect(result.current.newAchievements).toEqual(['survivor']);
  });

  it('should refuse actions on a finished game', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const finished = playToCompletion(twoPlayerGame(), 1);
    act(() => result.current.startGame(finished));

    const before = result.current.game
    act(() => result.current.performAction('miss'));

    // Unchanged: without this guard the last survivor could miss down to zero,
    // clearing the winner and reopening a game nobody is left to play
    expect(result.current.game).toBe(before);
  });

  it('should keep a spectator from touching their own saved game', async () => {
    const own = twoPlayerGame();
    saveCurrentGame(own);
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSpectatorGame(twoPlayerGame()));
    act(() => result.current.endGame());

    expect(result.current.isSpectatorMode).toBe(true);
    expect(loadCurrentGame()?.id).toBe(own.id);
  });

  it('should not persist a spectated game', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSpectatorGame(twoPlayerGame()));

    expect(loadCurrentGame()).toBeNull();
  });

  it('should sync each action once sharing is enabled', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.startGame(twoPlayerGame()));
    await act(async () => {
      await result.current.enableSharing();
    });

    act(() => result.current.performAction('miss'));

    expect(syncActiveGameToSupabase).toHaveBeenCalled();
  });

  it('should tell spectators when a shared game ends', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const game = twoPlayerGame();
    act(() => result.current.startGame(game, true));
    act(() => result.current.startGame(playToCompletion(game, 1), true));

    await waitFor(() => expect(updateGameStatus).toHaveBeenCalled());
  });

  it('should reset sharing and spectator mode when a new game starts', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSpectatorGame(twoPlayerGame()));
    act(() => result.current.startGame(twoPlayerGame()));

    expect(result.current.isSpectatorMode).toBe(false);
    expect(result.current.isSharingEnabled).toBe(false);
  });

  it('should throw when used outside the provider', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => renderHook(() => useGame())).toThrow('useGame must be used within a GameProvider');

    consoleErrorSpy.mockRestore();
  });
});
