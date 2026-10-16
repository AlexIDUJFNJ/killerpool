/**
 * Tests for the commentator: which shots are worth a line, and which changes
 * of the game are not shots at all
 */

import {
  analyzeTransition,
  detectCommentaryEvents,
  createPhrasePicker,
  isFinalDuel,
  isSingleNewShot,
  toSpeech,
  PHRASES,
  COMMENTARY_PRIORITY,
  type CommentaryKind,
} from '../commentary';
import { createGame, applyAction, undoLastAction, addPlayerToGame } from '../game-logic';
import { Game, GameAction } from '../types';

function newGame(...names: string[]): Game {
  return createGame(names.map(name => ({ name, avatar: '🎱' })));
}

/** The given player takes a shot, whoever's turn it was */
function shoot(game: Game, playerIndex: number, action: GameAction): Game {
  return applyAction({ ...game, currentPlayerIndex: playerIndex }, action);
}

function shots(game: Game, playerIndex: number, ...actions: GameAction[]): Game {
  return actions.reduce((g, action) => shoot(g, playerIndex, action), game);
}

const kinds = (prev: Game, next: Game) => detectCommentaryEvents(prev, next).map(e => e.kind);

describe('what counts as a new shot', () => {
  it('should stay quiet when a game is first seen', () => {
    // Opening a game, or a spectator loading one, is not a shot — even when
    // its last shot was the one that won it
    const won = shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss', 'miss');

    expect(analyzeTransition(null, won)).toBeNull();
    expect(detectCommentaryEvents(null, won)).toEqual([]);
  });

  it('should comment on exactly one new shot', () => {
    const game = newGame('Anna', 'Boris');
    expect(isSingleNewShot(game, shoot(game, 0, 'pot'))).toBe(true);
  });

  it('should not comment on an undo', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot', 'pot');
    expect(analyzeTransition(game, undoLastAction(game))).toBeNull();
  });

  it('should not announce an elimination when the host undoes the shot after it', () => {
    // Three players; Cleo goes out, then the host takes the next shot back
    const start = newGame('Anna', 'Boris', 'Cleo');
    const out = shots(start, 2, 'miss', 'miss', 'miss');
    const afterOut = shoot(out, 0, 'pot');

    const undone = undoLastAction(afterOut);
    expect(detectCommentaryEvents(afterOut, undone)).toEqual([]);
    // ...and taking back the knockout itself brings Cleo back without a word
    expect(detectCommentaryEvents(undone, undoLastAction(undone))).toEqual([]);
  });

  it('should not comment when an undo and a new shot arrive in one update', () => {
    // A spectator's realtime update can carry both: the length is the same,
    // the last shot is a different one
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot');
    const replaced = shoot(undoLastAction(game), 0, 'miss');

    expect(replaced.history).toHaveLength(game.history.length);
    expect(analyzeTransition(game, replaced)).toBeNull();
  });

  it('should not comment when an undo and two new shots arrive in one update', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot');
    const rewritten = shots(undoLastAction(game), 0, 'miss', 'miss');

    expect(rewritten.history).toHaveLength(game.history.length + 1);
    expect(analyzeTransition(game, rewritten)).toBeNull();
  });

  it('should not fire a batch of old events when a reconnect catches up on several shots', () => {
    const start = newGame('Anna', 'Boris', 'Cleo');
    const caughtUp = shots(start, 2, 'miss', 'miss', 'miss');

    expect(analyzeTransition(start, caughtUp)).toBeNull();
  });

  it('should not comment on the same state arriving twice', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    expect(analyzeTransition(game, { ...game })).toBeNull();
  });

  it('should not mix up two different games', () => {
    const one = newGame('Anna', 'Boris');
    const other = shoot(newGame('Anna', 'Boris'), 0, 'pot');
    expect(analyzeTransition(one, other)).toBeNull();
  });

  it('should not comment on a player joining', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'pot');
    expect(analyzeTransition(game, addPlayerToGame(game, 'Cleo', '🎯'))).toBeNull();
  });
});

describe('the sound of a shot', () => {
  const game = newGame('Anna', 'Boris', 'Cleo');

  it.each([
    ['pot', 'pot'],
    ['miss', 'miss'],
    ['pot_black', 'black'],
  ] as const)('should play %s as %s', (action, sound) => {
    expect(analyzeTransition(game, shoot(game, 0, action))?.sound).toBe(sound);
  });

  it('should play the knockout for an elimination', () => {
    const four = newGame('Anna', 'Boris', 'Cleo', 'Dan');
    const twoDown = shots(four, 3, 'miss', 'miss');
    expect(analyzeTransition(twoDown, shoot(twoDown, 3, 'miss'))?.sound).toBe('eliminated');
  });

  it('should play the duel drums when an elimination leaves two', () => {
    const twoDown = shots(game, 2, 'miss', 'miss');
    expect(analyzeTransition(twoDown, shoot(twoDown, 2, 'miss'))?.sound).toBe('duel');
  });

  it('should play the fanfare for the winning shot', () => {
    const twoDown = shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss');
    expect(analyzeTransition(twoDown, shoot(twoDown, 1, 'miss'))?.sound).toBe('victory');
  });
});

describe('streaks', () => {
  it('should call a streak of three, five and every one from seven', () => {
    const called: Array<[number, CommentaryKind[]]> = [];
    let game = newGame('Anna', 'Boris');
    for (let n = 1; n <= 9; n++) {
      const next = shoot(game, 0, n % 2 ? 'pot' : 'pot_black');
      called.push([n, kinds(game, next)]);
      game = next;
    }

    expect(called).toEqual([
      [1, []],
      [2, []],
      [3, ['streak_3']],
      [4, []],
      [5, ['streak_5']],
      [6, []],
      [7, ['streak_7']],
      [8, ['streak_7']],
      [9, ['streak_7']],
    ]);
  });

  it('should count the streak in the line', () => {
    const six = shots(newGame('Anna', 'Boris'), 0, 'pot', 'pot', 'pot', 'pot', 'pot', 'pot');
    const [event] = detectCommentaryEvents(six, shoot(six, 0, 'pot'));
    expect(event).toEqual({ kind: 'streak_7', name: 'Anna', count: 7 });
  });

  it('should count each player\'s own turns, whoever shoots in between', () => {
    let game = newGame('Anna', 'Boris');
    game = shoot(game, 0, 'pot');
    game = shoot(game, 1, 'miss');
    game = shoot(game, 0, 'pot');
    game = shoot(game, 1, 'pot');

    expect(kinds(game, shoot(game, 0, 'pot'))).toEqual(['streak_3']);
  });

  it('should start counting again after a miss', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot', 'pot', 'miss', 'pot', 'pot');
    expect(kinds(game, shoot(game, 0, 'pot'))).toEqual(['streak_3']);
  });

  it('should call the miss that ends a streak of three or more', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot', 'pot', 'pot', 'pot');
    const [event] = detectCommentaryEvents(game, shoot(game, 0, 'miss'));
    expect(event).toEqual({ kind: 'streak_broken', name: 'Anna', count: 4 });
  });

  it('should let an ordinary miss go', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'pot', 'pot');
    expect(kinds(game, shoot(game, 0, 'miss'))).toEqual([]);
  });
});

describe('lives', () => {
  it('should call the drop to the last life', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    expect(detectCommentaryEvents(game, shoot(game, 0, 'miss'))).toEqual([{ kind: 'last_life', name: 'Anna' }]);
  });

  it('should put a broken streak before the last life when one miss does both', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'miss', 'pot', 'pot', 'pot');
    expect(kinds(game, shoot(game, 0, 'miss'))).toEqual(['streak_broken', 'last_life']);
  });

  it('should call a black on the last life', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'miss', 'miss');
    expect(kinds(game, shoot(game, 0, 'pot_black'))).toEqual(['black_on_last_life']);
  });

  it('should call a comeback when a player who survived on one life climbs back', () => {
    // Hung on through a turn on the last life before the black
    const game = shots(newGame('Anna', 'Boris'), 0, 'miss', 'miss', 'pot');
    const next = shoot(game, 0, 'pot_black');

    expect(next.players[0].lives).toBe(2);
    expect(kinds(game, next)).toEqual(['comeback']);
  });

  it('should call a comeback for any climb off the last life a ruleset allows', () => {
    const generous = newGame('Anna', 'Boris');
    generous.ruleset = { ...generous.ruleset, params: { ...generous.ruleset.params, pot: 1 } };
    const game = shots(generous, 0, 'miss', 'miss');

    expect(kinds(game, shoot(game, 0, 'pot'))).toEqual(['comeback']);
  });

  it('should leave an ordinary black to the black-ball celebration', () => {
    const game = newGame('Anna', 'Boris');
    expect(kinds(game, shoot(game, 0, 'pot_black'))).toEqual([]);
  });
});

describe('eliminations, the final duel and the win', () => {
  it('should call an elimination that leaves more than two', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo', 'Dan'), 3, 'miss', 'miss');
    const transition = analyzeTransition(game, shoot(game, 3, 'miss'));

    expect(transition?.events).toEqual([{ kind: 'eliminated', name: 'Dan' }]);
    expect(transition?.duel).toBeNull();
  });

  it('should open the final duel when two are left of more', () => {
    const game = shoot(shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss'), 0, 'pot_black');
    const transition = analyzeTransition(game, shoot(game, 2, 'miss'));

    // The duel is the headline; the knockout that caused it comes with it
    expect(transition?.events.map(e => e.kind)).toEqual(['final_duel', 'eliminated']);
    expect(transition?.events[0]).toMatchObject({ name: 'Anna', rival: 'Boris' });
    expect(transition?.duel).toEqual([
      expect.objectContaining({ name: 'Anna', avatar: '🎱', lives: 4 }),
      expect.objectContaining({ name: 'Boris', lives: 3 }),
    ]);
  });

  it('should not open a duel in a game that started with two', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');

    expect(isFinalDuel(game)).toBe(false);
    expect(analyzeTransition(game, shoot(game, 1, 'miss'))?.duel).toBeNull();
    expect(kinds(game, shoot(game, 1, 'miss'))).not.toContain('final_duel');
  });

  it('should open the duel once, not on every shot of it', () => {
    const duel = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss', 'miss');
    expect(isFinalDuel(duel)).toBe(true);

    const next = shoot(duel, 0, 'miss');
    expect(analyzeTransition(duel, next)?.duel).toBeNull();
    expect(kinds(duel, next)).not.toContain('final_duel');
  });

  it('should open a duel again after a player joined and went out', () => {
    const duel = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss', 'miss');
    const joined = addPlayerToGame(duel, 'Dan', '🎯');
    expect(isFinalDuel(joined)).toBe(false);

    const dan = joined.players.length - 1;
    const almost = shots(joined, dan, 'miss', 'miss');
    expect(kinds(almost, shoot(almost, dan, 'miss'))[0]).toBe('final_duel');
  });

  it('should crown the winner, not the player who went out', () => {
    const game = shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss');
    const events = detectCommentaryEvents(game, shoot(game, 1, 'miss'));

    expect(events[0]).toEqual({ kind: 'victory', name: 'Anna' });
    expect(events.map(e => e.kind)).toEqual(['victory', 'eliminated']);
  });

  it('should not open a duel on the shot that wins a game of three', () => {
    const duel = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss', 'miss');
    const last = shots(duel, 1, 'miss', 'miss');
    const transition = analyzeTransition(last, shoot(last, 1, 'miss'));

    expect(transition?.events[0].kind).toBe('victory');
    expect(transition?.duel).toBeNull();
  });
});

describe('isFinalDuel', () => {
  it('should hold only while two of more are left and the game is on', () => {
    const three = newGame('Anna', 'Boris', 'Cleo');
    const duel = shots(three, 2, 'miss', 'miss', 'miss');

    expect(isFinalDuel(three)).toBe(false);
    expect(isFinalDuel(duel)).toBe(true);
    expect(isFinalDuel({ ...duel, status: 'abandoned' })).toBe(false);
    expect(isFinalDuel(shots(duel, 1, 'miss', 'miss', 'miss'))).toBe(false);
  });
});

describe('phrases', () => {
  it('should have several lines for every event', () => {
    for (const kind of COMMENTARY_PRIORITY) {
      expect(PHRASES[kind].length).toBeGreaterThanOrEqual(3);
      expect(new Set(PHRASES[kind]).size).toBe(PHRASES[kind].length);
    }
  });

  it('should never pick the same line twice in a row', () => {
    const picker = createPhrasePicker();
    for (const kind of COMMENTARY_PRIORITY) {
      let previous = '';
      for (let i = 0; i < 200; i++) {
        const line = picker.pick({ kind, name: 'Anna', rival: 'Boris', count: 7 });
        expect(line).not.toBe(previous);
        previous = line;
      }
    }
  });

  it('should step off a repeat even when the dice keep rolling the same', () => {
    const picker = createPhrasePicker(() => 0);
    const event = { kind: 'eliminated' as const, name: 'Anna' };
    const lines = Array.from({ length: 6 }, () => picker.pick(event));

    lines.slice(1).forEach((line, i) => expect(line).not.toBe(lines[i]));
  });

  it('should still use every line of a pool', () => {
    const picker = createPhrasePicker();
    const seen = new Set(Array.from({ length: 300 }, () => picker.pick({ kind: 'last_life', name: 'Anna' })));
    expect(seen.size).toBe(PHRASES.last_life.length);
  });

  it('should keep the no-repeat rule per event', () => {
    // A different event in between does not reset what was said last
    const picker = createPhrasePicker(() => 0);
    const first = picker.pick({ kind: 'last_life', name: 'Anna' });
    picker.pick({ kind: 'eliminated', name: 'Boris' });
    expect(picker.pick({ kind: 'last_life', name: 'Anna' })).not.toBe(first);
  });

  it('should fill in the names and the count', () => {
    const picker = createPhrasePicker();
    for (const kind of COMMENTARY_PRIORITY) {
      for (let i = 0; i < 20; i++) {
        const line = picker.pick({ kind, name: 'Anna', rival: 'Boris', count: 7 });
        expect(line).toContain('Anna');
        expect(line).not.toMatch(/[{}]/);
      }
    }
    const duelLines = PHRASES.final_duel.map(p => p.replace('{name}', 'A').replace('{rival}', 'B'));
    duelLines.forEach(line => expect(line).toMatch(/A[\s\S]*B/));
  });

  it('should drop in the house word now and then', () => {
    const all = Object.values(PHRASES).flat();
    expect(all.some(line => line.includes('CHYORNY!'))).toBe(true);
  });
});

describe('toSpeech', () => {
  it('should not let the voice spell CHYORNY out', () => {
    expect(toSpeech('CHYORNY! Anna pots the black')).toBe('Chorny! Anna pots the black');
  });

  it('should leave emoji out of what is read aloud', () => {
    expect(toSpeech('🔥 Anna 🎱 is on fire ⚔️')).toBe('Anna is on fire');
  });
});
