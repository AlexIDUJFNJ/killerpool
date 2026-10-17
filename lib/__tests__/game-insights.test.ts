/**
 * Tests for game insights: streaks, player statistics and awards
 */

import {
  getCurrentStreak,
  getPlayerStats,
  sortByStanding,
  computeAwards,
  getLastShotInsight,
  AWARD_THRESHOLDS,
  type PlayerStats,
} from '../game-insights';
import { createGame, applyAction, undoLastAction, addPlayerToGame, abandonGame } from '../game-logic';
import { DEFAULT_RULESET, Game, GameAction, GameHistoryEntry } from '../types';

const ACTIONS: Record<string, GameAction> = { p: 'pot', x: 'miss', b: 'pot_black' };

/** A fresh game with one-letter player names, 3 lives each */
function newGame(...names: string[]): Game {
  return createGame(names.map((name) => ({ name, avatar: '🎱' })));
}

/**
 * Plays shots written as "<player><shot>": p pot, x miss, b black. "Ap Bx Ab"
 * is A pots, B misses, A pots the black. Each shot goes to the named player
 * whatever the turn order says, the same way the rules engine is driven in
 * the game-page tests.
 */
function play(game: Game, shots: string): Game {
  return shots
    .split(/\s+/)
    .filter(Boolean)
    .reduce((g, shot) => {
      const index = g.players.findIndex((p) => p.name === shot[0]);
      if (index < 0) throw new Error(`No player ${shot[0]}`);
      return applyAction({ ...g, currentPlayerIndex: index }, ACTIONS[shot[1]]);
    }, game);
}

const idOf = (game: Game, name: string) => game.players.find((p) => p.name === name)!.id;

function statsOf(game: Game, name: string): PlayerStats {
  return getPlayerStats(game).find((s) => s.name === name)!;
}

function awardsBy(game: Game) {
  const names = new Map(game.players.map((p) => [p.id, p.name]));
  return computeAwards(game).map((a) => `${a.id}:${names.get(a.playerId)}`);
}

/**
 * A finished game built from a bare list of shots, for records the rules
 * engine would take dozens of shots to reach. Lives are not tracked: every
 * entry says 3 → 3, which no award here depends on.
 */
function finishedGame(shots: string, winner: string, names = ['A', 'B', 'C']): Game {
  const players = names.map((name) => ({ id: `id-${name}`, name, avatar: '🎱', lives: 3, eliminated: false }));
  const history: GameHistoryEntry[] = shots
    .split(/\s+/)
    .filter(Boolean)
    .map((shot, i) => ({
      id: `h${i}`,
      action: ACTIONS[shot[1]],
      playerId: `id-${shot[0]}`,
      playerName: shot[0],
      timestamp: '2026-10-16T10:00:00.000Z',
      livesBefore: 3,
      livesAfter: 3,
    }));
  return {
    id: 'game',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:30:00.000Z',
    status: 'completed',
    players,
    currentPlayerIndex: 0,
    winnerId: `id-${winner}`,
    ruleset: DEFAULT_RULESET,
    history,
  };
}

describe('getCurrentStreak', () => {
  it('should be 0 before anybody has played', () => {
    const game = newGame('A', 'B');

    expect(getCurrentStreak(game, idOf(game, 'A'))).toBe(0);
  });

  it('should count a player\'s own pots across the other players\' turns', () => {
    const game = play(newGame('A', 'B'), 'Ap Bx Ap Bp Ab');

    expect(getCurrentStreak(game, idOf(game, 'A'))).toBe(3);
    expect(getCurrentStreak(game, idOf(game, 'B'))).toBe(1);
  });

  it('should go back to 0 on a miss and count again from there', () => {
    const missed = play(newGame('A', 'B'), 'Ap Bp Ap Bp Ax');
    expect(getCurrentStreak(missed, idOf(missed, 'A'))).toBe(0);

    const again = play(missed, 'Bp Ap');
    expect(getCurrentStreak(again, idOf(again, 'A'))).toBe(1);
    expect(getCurrentStreak(again, idOf(again, 'B'))).toBe(3);
  });

  it('should follow undo both ways', () => {
    const potted = play(newGame('A', 'B'), 'Ap Bx Ap');
    expect(getCurrentStreak(potted, idOf(potted, 'A'))).toBe(2);
    // Taking back a pot shortens the streak…
    expect(getCurrentStreak(undoLastAction(potted), idOf(potted, 'A'))).toBe(1);

    // …and taking back the miss that ended one restores it
    const missed = play(potted, 'Bx Ax');
    expect(getCurrentStreak(missed, idOf(missed, 'A'))).toBe(0);
    expect(getCurrentStreak(undoLastAction(missed), idOf(missed, 'A'))).toBe(2);
  });

  it('should be 0 for an id that is not in the game', () => {
    const game = play(newGame('A', 'B'), 'Ap Bp');

    expect(getCurrentStreak(game, 'nobody')).toBe(0);
  });

  it('should count a player added mid-game from their first shot', () => {
    const started = play(newGame('A', 'B'), 'Ap Bp Ap');
    const joined = addPlayerToGame(started, 'C', '🎯');
    expect(getCurrentStreak(joined, idOf(joined, 'C'))).toBe(0);

    const played = play(joined, 'Cp Cb');
    expect(getCurrentStreak(played, idOf(played, 'C'))).toBe(2);
  });
});

describe('getPlayerStats', () => {
  it('should give every player a clean sheet before the first shot', () => {
    const game = newGame('A', 'B');

    expect(getPlayerStats(game)).toEqual([
      expect.objectContaining({
        name: 'A',
        turns: 0,
        pots: 0,
        blacks: 0,
        misses: 0,
        accuracy: 0,
        longestStreak: 0,
        currentStreak: 0,
        lives: 3,
        startingLives: 3,
        minLives: 3,
        wasOnLastLife: false,
        lastLifeShotsSurvived: 0,
        eliminationOrder: null,
        eliminatedAtShot: null,
        isWinner: false,
      }),
      expect.objectContaining({ name: 'B', turns: 0 }),
    ]);
  });

  it('should count pots with blacks included, and both streaks', () => {
    const game = play(newGame('A', 'B'), 'Ap Bx Ab Bx Ap Bp Ax Bp Ap');
    const a = statsOf(game, 'A');

    expect(a).toMatchObject({
      turns: 5,
      pots: 4,
      blacks: 1,
      misses: 1,
      accuracy: 0.8,
      longestStreak: 3,
      currentStreak: 1,
    });
    expect(statsOf(game, 'B')).toMatchObject({ turns: 4, pots: 2, misses: 2, accuracy: 0.5 });
  });

  it('should keep the lowest point and the time spent on the last life', () => {
    // A drops to one life, survives two shots there, gets off it with a black
    // and is back on one life when the game ends
    const game = play(newGame('A', 'B'), 'Ax Ax Ap Ab Bx Ax Bx Bx');
    const a = statsOf(game, 'A');

    expect(a.minLives).toBe(1);
    expect(a.wasOnLastLife).toBe(true);
    expect(a.lastLifeShotsSurvived).toBe(2);
    expect(statsOf(game, 'B')).toMatchObject({ minLives: 0, wasOnLastLife: true, lastLifeShotsSurvived: 0 });
  });

  it('should number the players out in the order the shots put them out', () => {
    const game = play(newGame('A', 'B', 'C'), 'Bx Bx Cx Cx Bx Cx');

    expect(statsOf(game, 'B')).toMatchObject({ eliminationOrder: 1, eliminatedAtShot: 5 });
    expect(statsOf(game, 'C')).toMatchObject({ eliminationOrder: 2, eliminatedAtShot: 6 });
    expect(statsOf(game, 'A')).toMatchObject({ eliminationOrder: null, isWinner: true });
  });

  it('should forget an elimination that was undone', () => {
    const out = play(newGame('A', 'B', 'C'), 'Bx Bx Bx');
    expect(statsOf(out, 'B').eliminationOrder).toBe(1);

    const undone = undoLastAction(out);
    expect(statsOf(undone, 'B')).toMatchObject({ eliminationOrder: null, eliminatedAtShot: null, turns: 2 });
  });

  it('should start a player added mid-game from the lives they joined with', () => {
    const started = play(newGame('A', 'B'), 'Ax Bx Ax');
    const joined = addPlayerToGame(started, 'C', '🎯');
    // Joined on one life, the fewest anybody had: on the last life before playing
    expect(statsOf(joined, 'C')).toMatchObject({ turns: 0, startingLives: 1, minLives: 1, wasOnLastLife: true });

    const played = play(joined, 'Cp Cb');
    expect(statsOf(played, 'C')).toMatchObject({
      turns: 2,
      pots: 2,
      startingLives: 1,
      minLives: 1,
      lastLifeShotsSurvived: 2,
    });
  });

  it('should ignore shots by somebody no longer in the game', () => {
    const game = play(newGame('A', 'B'), 'Ap Bp');
    const stray = { ...game.history[0], id: 'stray', playerId: 'ghost' };

    expect(getPlayerStats({ ...game, history: [stray, ...game.history] }).map((s) => s.turns)).toEqual([1, 1]);
  });

  it('should crown nobody in an abandoned game', () => {
    const game = abandonGame(play(newGame('A', 'B'), 'Ap Bp'));

    expect(getPlayerStats({ ...game, winnerId: idOf(game, 'A') }).some((s) => s.isWinner)).toBe(false);
  });
});

describe('sortByStanding', () => {
  it('should put the winner first and the first out last', () => {
    const game = play(newGame('A', 'B', 'C', 'D'), 'Cx Cx Cx Ax Ax Ax Dx Dx Dx');

    expect(sortByStanding(getPlayerStats(game)).map((s) => s.name)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('should keep the players still in by seat when nobody has won', () => {
    const game = abandonGame(play(newGame('A', 'B', 'C'), 'Ax Ax Ax'));

    expect(sortByStanding(getPlayerStats(game)).map((s) => s.name)).toEqual(['B', 'C', 'A']);
  });
});

describe('computeAwards', () => {
  /*
    A pots six (four in a row) and wins; B pots two blacks; C goes out first.

    shot  1 Ap   2 Bb   3 Cx   4 Ap   5 Bb   6 Cx   7 Ap   8 Bx   9 Cx (C out)
         10 Ap  11 Bx  12 Ax  13 Bx  14 Ap  15 Bx  16 Ap  17 Bx (B out, A wins)
  */
  const SHOWCASE = 'Ap Bb Cx Ap Bb Cx Ap Bx Cx Ap Bx Ax Bx Ap Bx Ap Bx';

  it('should hand out every award a game has earned, in a fixed order', () => {
    const game = play(newGame('A', 'B', 'C'), SHOWCASE);

    expect(game.status).toBe('completed');
    expect(computeAwards(game)).toEqual([
      { id: 'mvp', title: 'MVP', emoji: '🏅', playerId: idOf(game, 'A'), detail: '6 balls potted' },
      { id: 'hot_streak', title: 'Hot Streak', emoji: '🔥', playerId: idOf(game, 'A'), detail: 'streak of 4' },
      { id: 'black_ball_master', title: 'Black Ball Master', emoji: '🎱', playerId: idOf(game, 'B'), detail: '2 blacks' },
      { id: 'sniper', title: 'Sniper', emoji: '🎯', playerId: idOf(game, 'A'), detail: '86% · 6 of 7' },
      { id: 'first_out', title: 'First Out', emoji: '🚪', playerId: idOf(game, 'C'), detail: 'out after 3 turns' },
    ]);
  });

  it('should give nothing to a game still being played', () => {
    const game = play(newGame('A', 'B', 'C'), SHOWCASE.split(' ').slice(0, -1).join(' '));

    expect(game.status).toBe('active');
    expect(computeAwards(game)).toEqual([]);
  });

  it('should give nothing to an abandoned game, whatever its winnerId says', () => {
    const played = play(newGame('A', 'B', 'C'), 'Ap Bb Cx Ap Bb Cx Ap Bx Cx Ap');
    const game = { ...abandonGame(played), winnerId: idOf(played, 'A') };

    expect(computeAwards(game)).toEqual([]);
  });

  it('should take the awards back with the winning shot', () => {
    const won = play(newGame('A', 'B', 'C'), SHOWCASE);

    expect(computeAwards(undoLastAction(won))).toEqual([]);
  });

  it('should give nothing for an empty history or a winner who is not in the game', () => {
    const game = newGame('A', 'B');

    expect(computeAwards({ ...game, status: 'completed' })).toEqual([]);
    expect(computeAwards({ ...game, status: 'completed', winnerId: 'ghost' })).toEqual([]);
  });

  it('should give nothing to a game where nobody reached a threshold', () => {
    // Two pots, a streak of two, no black, three turns: nothing worth a prize
    const game = play(newGame('A', 'B'), 'Ap Bx Ap Bx Ax Bx');

    expect(game.status).toBe('completed');
    expect(computeAwards(game)).toEqual([]);
  });

  describe('ties', () => {
    // A and B pot three in a row each, A first; A then misses out
    const game = () => play(newGame('A', 'B'), 'Ap Bp Ap Bp Ap Bp Ax Bx Ax Bx Ax');

    it('should go to whoever reached the figure first', () => {
      const awards = awardsBy(game());

      expect(awards).toContain('mvp:A');
      expect(awards).toContain('hot_streak:A');
    });

    it('should go to whoever potted their last black first', () => {
      const tied = play(newGame('A', 'B'), 'Bb Ab Ab Bb Ax Bx Ax Bx Ax Bx Ax Ax');

      expect(awardsBy(tied)).toContain('black_ball_master:A');
    });
  });

  describe('thresholds', () => {
    it(`should need ${AWARD_THRESHOLDS.mvpPots} pots for MVP and a streak of ${AWARD_THRESHOLDS.hotStreak}`, () => {
      const short = play(newGame('A', 'B'), 'Ap Bx Ap Bx Ax Bx');
      expect(awardsBy(short)).toEqual([]);

      const enough = play(newGame('A', 'B'), 'Ap Bx Ap Bx Ap Bx');
      expect(awardsBy(enough)).toEqual(['mvp:A', 'hot_streak:A']);
    });

    it(`should need ${AWARD_THRESHOLDS.blackBalls} blacks for Black Ball Master`, () => {
      const one = play(newGame('A', 'B'), 'Ab Bx Ax Bx Ax Bx');
      expect(awardsBy(one)).not.toContain('black_ball_master:A');

      const two = play(newGame('A', 'B'), 'Ab Bx Ab Bx Ax Bx');
      expect(computeAwards(two).find((a) => a.id === 'black_ball_master')?.detail).toBe('2 blacks');
    });

    it('should make Sniper earn it: five turns and 60% at least', () => {
      // 3 of 5 is exactly 60%
      expect(awardsBy(finishedGame('Ap Ap Ap Ax Ax', 'A'))).toContain('sniper:A');
      // 2 of 4 is too few turns, and too low besides
      expect(awardsBy(finishedGame('Ap Ap Ax Ax', 'A'))).not.toContain('sniper:A');
      // 4 of 7 is 57%
      expect(awardsBy(finishedGame('Ap Ap Ap Ap Ax Ax Ax', 'A'))).not.toContain('sniper:A');
    });

    it('should give Sniper to the longer run at the same rate, and to nobody on an exact tie', () => {
      const sameRate = finishedGame('Ap Ap Ap Ap Ax Bp Bp Bp Bp Bp Bp Bp Bp Bx Bx', 'A');
      expect(computeAwards(sameRate).find((a) => a.id === 'sniper')).toMatchObject({
        playerId: 'id-B',
        detail: '80% · 8 of 10',
      });

      const exact = finishedGame('Ap Ap Ap Ap Ax Bp Bp Bp Bp Bx', 'A');
      expect(computeAwards(exact).some((a) => a.id === 'sniper')).toBe(false);
    });

    it(`should need ${AWARD_THRESHOLDS.survivorShots} shots survived on the last life for Survivor`, () => {
      const two = play(newGame('A', 'B'), 'Ax Bp Ax Ap Bx Ap Bx Bx');
      expect(statsOf(two, 'A').lastLifeShotsSurvived).toBe(2);
      expect(awardsBy(two)).not.toContain('survivor:A');

      const three = play(newGame('A', 'B'), 'Ax Bp Ax Ap Bx Ap Bx Ap Bx');
      expect(computeAwards(three).find((a) => a.id === 'survivor')).toMatchObject({
        playerId: idOf(three, 'A'),
        detail: '3 shots on the last life',
      });
    });

    it('should give First Out only with three players or more', () => {
      const duel = play(newGame('A', 'B'), 'Bx Bx Bx');
      expect(awardsBy(duel).some((a) => a.startsWith('first_out'))).toBe(false);

      const three = play(newGame('A', 'B', 'C'), 'Bx Bx Bx Cx Cx Cx');
      expect(computeAwards(three).find((a) => a.id === 'first_out')).toMatchObject({
        playerId: idOf(three, 'B'),
        detail: 'out after 3 turns',
      });
    });
  });

  describe('Comeback', () => {
    it('should go to a winner who was on the last life while somebody had more', () => {
      // A is down to one life with B on three, and still wins
      const game = play(newGame('A', 'B'), 'Ax Bp Ax Bx Ap Bx Ap Bx');

      expect(computeAwards(game).find((a) => a.id === 'comeback')).toEqual({
        id: 'comeback',
        title: 'Comeback',
        emoji: '💪',
        playerId: idOf(game, 'A'),
        detail: 'won from the last life',
      });
    });

    it('should not go to a winner who was only ever level on one life', () => {
      const game = play(newGame('A', 'B'), 'Bx Bx Ax Ax Bx');

      expect(statsOf(game, 'A').wasOnLastLife).toBe(true);
      expect(awardsBy(game)).not.toContain('comeback:A');
    });

    it('should not go to a winner who never dropped to one life', () => {
      const game = play(newGame('A', 'B'), 'Ax Bx Bx Bx');

      expect(awardsBy(game)).not.toContain('comeback:A');
    });

    it('should not count a player added later as ahead before they joined', () => {
      // A and B are level on one life, both pot a black off it, then C joins
      // on two lives. Counted from the start, C would have been "ahead" of A
      // back when A was on one life.
      const level = play(newGame('A', 'B'), 'Bx Bx Ax Ax Ab Bb');
      const joined = addPlayerToGame(level, 'C', '🎯');
      const game = play(joined, 'Cp Ap Bx Bx Cx Cx');

      expect(game.winnerId).toBe(idOf(game, 'A'));
      expect(awardsBy(game)).not.toContain('comeback:A');
    });
  });

  it('should let a player added mid-game win awards', () => {
    const started = play(newGame('A', 'B', 'C'), 'Ap Bp Cp');
    const joined = addPlayerToGame(started, 'D', '🎯');
    const game = play(joined, 'Dp Db Db Ax Ax Ax Bx Bx Bx Cx Cx Cx');

    expect(game.winnerId).toBe(idOf(game, 'D'));
    expect(awardsBy(game)).toEqual(['mvp:D', 'hot_streak:D', 'black_ball_master:D', 'first_out:A']);
  });

  it('should spell a single figure in the singular', () => {
    // C goes out on their first shot after joining on one life
    const started = play(newGame('A', 'B'), 'Ax Bx Ax');
    const joined = addPlayerToGame(started, 'C', '🎯');
    const game = play(joined, 'Cx Bx Bx');

    expect(computeAwards(game).find((a) => a.id === 'first_out')?.detail).toBe('out after 1 turn');
  });
});

describe('getLastShotInsight', () => {
  it('should be null before the first shot', () => {
    expect(getLastShotInsight(newGame('A', 'B'))).toBeNull();
  });

  it('should report a streak growing', () => {
    const game = play(newGame('A', 'B'), 'Ap Bx Ab');

    expect(getLastShotInsight(game)).toMatchObject({
      index: 2,
      playerId: idOf(game, 'A'),
      playerName: 'A',
      action: 'pot_black',
      livesBefore: 3,
      livesAfter: 4,
      streak: 2,
      streakEnded: 0,
      eliminated: false,
      playersLeft: 2,
    });
  });

  it('should report the streak a miss ended and a drop to the last life', () => {
    const game = play(newGame('A', 'B'), 'Ax Ap Bp Ap Ap Ax');

    expect(getLastShotInsight(game)).toMatchObject({
      streak: 0,
      streakEnded: 3,
      droppedToLastLife: true,
      escapedLastLife: false,
    });
  });

  it('should report an escape from the last life and an elimination', () => {
    const escaped = play(newGame('A', 'B'), 'Ax Ax Ab');
    expect(getLastShotInsight(escaped)).toMatchObject({ escapedLastLife: true, droppedToLastLife: false });

    const out = play(newGame('A', 'B', 'C'), 'Ax Ax Ax');
    expect(getLastShotInsight(out)).toMatchObject({ eliminated: true, playersLeft: 2 });
  });
});
