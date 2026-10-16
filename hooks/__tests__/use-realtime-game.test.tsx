/**
 * Tests for useRealtimeGame — the spectator's live subscription
 */

import * as React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeGame } from '../use-realtime-game';
import { subscribeToGame, unsubscribeFromGame } from '@/lib/realtime';
import { createGame } from '@/lib/game-logic';
import { Game } from '@/lib/types';

jest.mock('@/lib/realtime', () => ({
  subscribeToGame: jest.fn(),
  unsubscribeFromGame: jest.fn().mockResolvedValue(undefined),
}));

const mockedSubscribe = subscribeToGame as jest.MockedFunction<typeof subscribeToGame>;

interface Subscription {
  gameId: string;
  channel: { id: number };
  onUpdate: (game: Game) => void;
  onStatus?: (connected: boolean) => void;
}

let subscriptions: Subscription[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  subscriptions = [];
  mockedSubscribe.mockImplementation((gameId, onUpdate, onStatus) => {
    const channel = { id: subscriptions.length };
    subscriptions.push({ gameId, channel, onUpdate, onStatus });
    return channel as never;
  });
});

const someGame = () =>
  createGame([
    { name: 'Anna', avatar: '🎱' },
    { name: 'Boris', avatar: '🎯' },
  ]);

describe('useRealtimeGame', () => {
  it('should not subscribe without a game', () => {
    renderHook(() => useRealtimeGame(null, { onGameUpdate: jest.fn() }));

    expect(subscribeToGame).not.toHaveBeenCalled();
  });

  it('should deliver updates of the followed game', () => {
    const onGameUpdate = jest.fn();
    renderHook(() => useRealtimeGame('game-1', { onGameUpdate }));

    const update = someGame();
    act(() => subscriptions[0].onUpdate(update));

    expect(subscriptions[0].gameId).toBe('game-1');
    expect(onGameUpdate).toHaveBeenCalledWith(update);
  });

  it('should close the subscription on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeGame('game-1', { onGameUpdate: jest.fn() }));

    unmount();

    expect(unsubscribeFromGame).toHaveBeenCalledWith(subscriptions[0].channel);
  });

  it('should move to a new channel when the game changes', () => {
    const { rerender } = renderHook(
      ({ id }) => useRealtimeGame(id, { onGameUpdate: jest.fn() }),
      { initialProps: { id: 'game-1' as string | null } }
    );

    rerender({ id: 'game-2' });

    expect(unsubscribeFromGame).toHaveBeenCalledWith(subscriptions[0].channel);
    expect(subscriptions[1].gameId).toBe('game-2');
  });

  it('should ignore anything a closed channel still delivers', () => {
    // removeChannel is asynchronous: an update can arrive after the cleanup
    const onGameUpdate = jest.fn();
    const onStatus = jest.fn();
    const { unmount } = renderHook(() => useRealtimeGame('game-1', { onGameUpdate, onStatus }));

    unmount();
    subscriptions[0].onUpdate(someGame());
    subscriptions[0].onStatus?.(true);

    expect(onGameUpdate).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('should survive StrictMode running the effect twice', () => {
    const onGameUpdate = jest.fn();
    renderHook(() => useRealtimeGame('game-1', { onGameUpdate }), {
      wrapper: React.StrictMode,
    });

    // One channel opened and closed by the simulated unmount, one live
    expect(subscriptions).toHaveLength(2);
    expect(unsubscribeFromGame).toHaveBeenCalledTimes(1);
    expect(unsubscribeFromGame).toHaveBeenCalledWith(subscriptions[0].channel);

    const update = someGame();
    act(() => subscriptions[1].onUpdate(update));
    expect(onGameUpdate).toHaveBeenCalledTimes(1);
  });

  it('should call the latest callback without resubscribing', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(
      ({ cb }) => useRealtimeGame('game-1', { onGameUpdate: cb }),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    act(() => subscriptions[0].onUpdate(someGame()));

    expect(subscribeToGame).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('should pass on the connection status', () => {
    const onStatus = jest.fn();
    renderHook(() => useRealtimeGame('game-1', { onGameUpdate: jest.fn(), onStatus }));

    act(() => subscriptions[0].onStatus?.(true));

    expect(onStatus).toHaveBeenCalledWith(true);
  });
});
