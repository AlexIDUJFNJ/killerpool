/**
 * Tests for useGameCommentary — sound, voice and lines from each state of the
 * game to the next, for the host and for a spectator alike
 */

import { renderHook, act } from '@testing-library/react';
import { useGameCommentary, VOICE_DELAY_MS } from '../use-game-commentary';
import { createGame, applyAction, undoLastAction } from '@/lib/game-logic';
import { setAudioSetting } from '@/lib/audio-settings';
import { DUEL_MS } from '@/lib/commentary-queue';
import { playSound, unlockSound } from '@/lib/sound';
import { speak, stopVoice, unlockVoice } from '@/lib/voice';
import { Game, GameAction } from '@/lib/types';

jest.mock('@/lib/sound', () => ({
  playSound: jest.fn(),
  unlockSound: jest.fn(),
}));

jest.mock('@/lib/voice', () => ({
  speak: jest.fn(),
  stopVoice: jest.fn(),
  unlockVoice: jest.fn(),
}));

function newGame(...names: string[]): Game {
  return createGame(names.map(name => ({ name, avatar: '🎱' })));
}

function shoot(game: Game, playerIndex: number, action: GameAction): Game {
  return applyAction({ ...game, currentPlayerIndex: playerIndex }, action);
}

function shots(game: Game, playerIndex: number, ...actions: GameAction[]): Game {
  return actions.reduce((g, action) => shoot(g, playerIndex, action), game);
}

function follow(initial: Game | null, held = false) {
  return renderHook(
    ({ game, held }: { game: Game | null; held: boolean }) => useGameCommentary(game, { held }),
    { initialProps: { game: initial, held } }
  );
}

const line = (queue: { getSnapshot: () => { line: { text: string } | null } }) =>
  queue.getSnapshot().line?.text ?? null;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a new shot', () => {
  it('should play its sound and nothing else for an ordinary pot', () => {
    const game = newGame('Anna', 'Boris');
    const { result, rerender } = follow(game);

    rerender({ game: shoot(game, 0, 'pot'), held: false });

    expect(playSound).toHaveBeenCalledWith('pot');
    expect(line(result.current)).toBeNull();
    expect(speak).not.toHaveBeenCalled();
  });

  it('should show the line and say it after the sound', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    const { result, rerender } = follow(game);

    rerender({ game: shoot(game, 0, 'miss'), held: false });

    expect(playSound).toHaveBeenCalledWith('miss');
    const text = line(result.current);
    expect(text).toContain('Anna');
    expect(speak).toHaveBeenCalledWith(text, VOICE_DELAY_MS.miss);
  });

  it('should put up the duel overlay before the line', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss');
    const { result, rerender } = follow(game);

    rerender({ game: shoot(game, 2, 'miss'), held: false });

    expect(playSound).toHaveBeenCalledWith('duel');
    expect(result.current.getSnapshot().duel?.players.map(p => p.name)).toEqual(['Anna', 'Boris']);
    expect(line(result.current)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(DUEL_MS);
    });
    expect(result.current.getSnapshot().duel).toBeNull();
    expect(line(result.current)).toMatch(/Anna[\s\S]*Boris/);
  });

  it('should hold the line back while the black-ball celebration is up', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'miss', 'miss');
    const { result, rerender } = follow(game);

    // The shot and the celebration arrive in the same render
    const black = shoot(game, 0, 'pot_black');
    rerender({ game: black, held: true });
    expect(playSound).toHaveBeenCalledWith('black');
    expect(line(result.current)).toBeNull();

    rerender({ game: black, held: false });
    expect(line(result.current)).toMatch(/Anna/);
  });
});

describe('changes that are not a shot', () => {
  it('should stay quiet on the first state, as when a game is opened', () => {
    const won = shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss', 'miss');
    const { result } = follow(won);

    expect(playSound).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(line(result.current)).toBeNull();
  });

  it('should stay quiet when a spectator loads the game after nothing', () => {
    const watched = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss', 'miss');
    const { result, rerender } = follow(null);

    rerender({ game: watched, held: false });

    expect(playSound).not.toHaveBeenCalled();
    expect(result.current.getSnapshot()).toEqual({ line: null, duel: null });
  });

  it('should stay quiet when the screen switches from the host\'s own game to a watched one', () => {
    const own = shots(newGame('Me', 'You'), 0, 'pot');
    const watched = shots(newGame('Anna', 'Boris'), 0, 'pot');
    const { rerender } = follow(own);

    rerender({ game: watched, held: false });

    expect(playSound).not.toHaveBeenCalled();
  });

  it('should not announce anything when the host undoes a knockout', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss');
    const out = shoot(game, 2, 'miss');
    const { result, rerender } = follow(out);

    rerender({ game: undoLastAction(out), held: false });

    expect(playSound).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(result.current.getSnapshot()).toEqual({ line: null, duel: null });
  });

  it('should withdraw a line still up about the shot taken back', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo', 'Dan'), 3, 'miss', 'miss');
    const out = shoot(game, 3, 'miss');
    const { result, rerender } = follow(game);
    rerender({ game: out, held: false });
    expect(line(result.current)).toContain('Dan');

    rerender({ game: undoLastAction(out), held: false });

    expect(line(result.current)).toBeNull();
    expect(stopVoice).toHaveBeenCalled();
  });

  it('should comment again on a shot taken after an undo', () => {
    // The host took the knockout back, and the player misses again for real
    const game = shots(newGame('Anna', 'Boris', 'Cleo', 'Dan'), 3, 'miss', 'miss');
    const out = shoot(game, 3, 'miss');
    const { result, rerender } = follow(out);

    const undone = undoLastAction(out);
    rerender({ game: undone, held: false });
    rerender({ game: shoot(undone, 3, 'miss'), held: false });

    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('eliminated');
    expect(line(result.current)).toContain('Dan');
  });

  it('should not fire a batch of events when a reconnect catches up on several shots', () => {
    const start = newGame('Anna', 'Boris', 'Cleo');
    const { result, rerender } = follow(start);

    rerender({ game: shots(start, 2, 'miss', 'miss', 'miss'), held: false });

    expect(playSound).not.toHaveBeenCalled();
    expect(result.current.getSnapshot()).toEqual({ line: null, duel: null });
  });

  it('should pick up again with the next single shot after a catch-up', () => {
    const start = newGame('Anna', 'Boris', 'Cleo');
    const caughtUp = shots(start, 2, 'miss', 'miss');
    const { rerender } = follow(start);
    rerender({ game: caughtUp, held: false });

    rerender({ game: shoot(caughtUp, 2, 'miss'), held: false });

    expect(playSound).toHaveBeenCalledWith('duel');
  });
});

describe('the settings', () => {
  it('should leave the sound out when effects are off', () => {
    setAudioSetting('sound', false);
    const game = newGame('Anna', 'Boris');
    const { rerender } = follow(game);

    rerender({ game: shoot(game, 0, 'pot'), held: false });

    expect(playSound).not.toHaveBeenCalled();
  });

  it('should still show the line with the voice off', () => {
    setAudioSetting('voice', false);
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    const { result, rerender } = follow(game);

    rerender({ game: shoot(game, 0, 'miss'), held: false });

    expect(speak).not.toHaveBeenCalled();
    expect(line(result.current)).toContain('Anna');
  });
});

describe('unlocking audio', () => {
  it('should unlock what is switched on with every gesture', () => {
    follow(newGame('Anna', 'Boris'));

    window.dispatchEvent(new Event('pointerdown'));
    expect(unlockSound).toHaveBeenCalledTimes(1);
    expect(unlockVoice).toHaveBeenCalledTimes(1);

    setAudioSetting('voice', false);
    window.dispatchEvent(new Event('touchend'));
    expect(unlockSound).toHaveBeenCalledTimes(2);
    expect(unlockVoice).toHaveBeenCalledTimes(1);
  });

  it('should stop listening once the screen is gone', () => {
    const { unmount } = follow(newGame('Anna', 'Boris'));
    unmount();

    window.dispatchEvent(new Event('pointerdown'));
    expect(unlockSound).not.toHaveBeenCalled();
  });
});

describe('leaving the screen', () => {
  it('should silence the voice and clear the stage', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    const { result, rerender, unmount } = follow(game);
    rerender({ game: shoot(game, 0, 'miss'), held: false });
    const queue = result.current;

    unmount();

    expect(stopVoice).toHaveBeenCalled();
    expect(queue.getSnapshot()).toEqual({ line: null, duel: null });
  });
});
