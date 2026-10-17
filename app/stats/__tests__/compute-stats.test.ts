/**
 * Tests for the /stats calculation
 */

import { DEFAULT_RULESET, Game, GameHistoryEntry } from '@/lib/types';
import { computeStats, getMyIds } from '../compute-stats';

const USER_ID = 'user-1';
const GUEST_ID = 'guest-1';

let seq = 0;
function makeGame({
  ownerId,
  iWon,
  status = 'completed',
  day,
  myLives = 2,
  myActions = [],
}: {
  ownerId: string | null;
  iWon: boolean;
  status?: Game['status'];
  day: number;
  myLives?: number;
  myActions?: GameHistoryEntry['action'][];
}): Game {
  seq++;
  return {
    id: `game-${seq}`,
    createdAt: new Date(2026, 9, day).toISOString(),
    updatedAt: new Date(2026, 9, day, 1).toISOString(),
    status,
    players: [
      { id: `me-${seq}`, name: 'Me', avatar: '🎯', lives: myLives, eliminated: !iWon, userId: ownerId },
      { id: `them-${seq}`, name: 'Them', avatar: '🎱', lives: iWon ? 0 : 1, eliminated: iWon, userId: null },
    ],
    currentPlayerIndex: 0,
    winnerId: status === 'completed' ? (iWon ? `me-${seq}` : `them-${seq}`) : null,
    ruleset: DEFAULT_RULESET,
    history: myActions.map((action, i) => ({
      id: `h-${seq}-${i}`,
      action,
      playerId: `me-${seq}`,
      playerName: 'Me',
      timestamp: new Date(2026, 9, day, 0, i).toISOString(),
      livesBefore: 3,
      livesAfter: 3,
    })),
  };
}

describe('getMyIds', () => {
  it('should hold both the account and the guest id', () => {
    expect([...getMyIds(USER_ID, GUEST_ID)]).toEqual([USER_ID, GUEST_ID]);
  });

  it('should hold just the guest id when signed out', () => {
    expect([...getMyIds(null, GUEST_ID)]).toEqual([GUEST_ID]);
  });
});

describe('computeStats', () => {
  it('should return null when the player has no completed games', () => {
    expect(computeStats([], getMyIds(USER_ID, GUEST_ID))).toBeNull();
    expect(
      computeStats([makeGame({ ownerId: 'someone-else', iWon: true, day: 1 })], getMyIds(USER_ID, GUEST_ID))
    ).toBeNull();
  });

  it('should keep counting guest games after signing in', () => {
    const games = [
      makeGame({ ownerId: GUEST_ID, iWon: true, day: 1 }),
      makeGame({ ownerId: USER_ID, iWon: false, day: 2 }),
    ];

    const stats = computeStats(games, getMyIds(USER_ID, GUEST_ID));

    expect(stats?.totalGames).toBe(2);
    expect(stats?.gamesWon).toBe(1);
    expect(stats?.gamesLost).toBe(1);
    expect(stats?.winRate).toBe(50);
  });

  it('should not count abandoned games as wins, losses or streak breakers', () => {
    const games = [
      makeGame({ ownerId: USER_ID, iWon: true, day: 1 }),
      makeGame({ ownerId: USER_ID, iWon: false, status: 'abandoned', day: 2, myLives: 6, myActions: ['miss'] }),
      makeGame({ ownerId: USER_ID, iWon: true, day: 3 }),
    ];

    const stats = computeStats(games, getMyIds(USER_ID, GUEST_ID));

    expect(stats?.totalGames).toBe(2);
    expect(stats?.gamesWon).toBe(2);
    expect(stats?.gamesLost).toBe(0);
    expect(stats?.currentStreak).toBe(2);
    expect(stats?.longestWinStreak).toBe(2);
    // Neither its lives nor its shots leak into the totals
    expect(stats?.bestGame?.livesRemaining).toBe(2);
    expect(stats?.totalMisses).toBe(0);
  });

  it('should return null when every game was abandoned', () => {
    const games = [makeGame({ ownerId: USER_ID, iWon: false, status: 'abandoned', day: 1 })];

    expect(computeStats(games, getMyIds(USER_ID, GUEST_ID))).toBeNull();
  });

  it('should compute streaks in date order regardless of storage order', () => {
    const games = [
      makeGame({ ownerId: USER_ID, iWon: true, day: 5 }),
      makeGame({ ownerId: USER_ID, iWon: true, day: 1 }),
      makeGame({ ownerId: USER_ID, iWon: false, day: 3 }),
      makeGame({ ownerId: USER_ID, iWon: true, day: 2 }),
      makeGame({ ownerId: USER_ID, iWon: true, day: 4 }),
    ];

    const stats = computeStats(games, getMyIds(USER_ID, GUEST_ID));

    // win, win, loss, win, win
    expect(stats?.longestWinStreak).toBe(2);
    expect(stats?.currentStreak).toBe(2);
  });

  it('should reset the current streak after a loss', () => {
    const games = [
      makeGame({ ownerId: USER_ID, iWon: true, day: 1 }),
      makeGame({ ownerId: USER_ID, iWon: false, day: 2 }),
    ];

    expect(computeStats(games, getMyIds(USER_ID, GUEST_ID))?.currentStreak).toBe(0);
  });

  it('should count only my own shots', () => {
    const game = makeGame({ ownerId: USER_ID, iWon: true, day: 1, myActions: ['miss', 'pot', 'pot_black', 'pot_black'] });
    game.history.push({ ...game.history[0], id: 'theirs', playerId: game.players[1].id });

    const stats = computeStats([game], getMyIds(USER_ID, GUEST_ID));

    expect(stats?.totalMisses).toBe(1);
    expect(stats?.totalPots).toBe(1);
    expect(stats?.totalBlackPots).toBe(2);
    expect(stats?.totalActions).toBe(4);
  });
});
