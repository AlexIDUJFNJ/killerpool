/**
 * Tests for the history list helpers
 */

import { DEFAULT_RULESET, Game } from '@/lib/types';
import {
  filterGames,
  formatDuration,
  getGameWinner,
  isFinishedGame,
  staggerDelay,
} from '../history-utils';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: overrides.id ?? 'game-1',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:12:30.000Z',
    status: 'completed',
    players: [
      { id: 'p1', name: 'Alice', avatar: '🎯', lives: 2, eliminated: false },
      { id: 'p2', name: 'Bob', avatar: '🎱', lives: 0, eliminated: true },
    ],
    currentPlayerIndex: 0,
    winnerId: 'p1',
    ruleset: DEFAULT_RULESET,
    history: [],
    ...overrides,
  };
}

const noFilters = { query: '', date: 'all', status: 'all' } as const;

describe('isFinishedGame', () => {
  it('should keep completed and abandoned games', () => {
    expect(isFinishedGame(makeGame({ status: 'completed' }))).toBe(true);
    expect(isFinishedGame(makeGame({ status: 'abandoned', winnerId: null }))).toBe(true);
  });

  it('should drop games that are still being played', () => {
    expect(isFinishedGame(makeGame({ status: 'active', winnerId: null }))).toBe(false);
    expect(isFinishedGame(makeGame({ status: 'setup', winnerId: null }))).toBe(false);
  });
});

describe('getGameWinner', () => {
  it('should return the winner of a completed game', () => {
    expect(getGameWinner(makeGame())?.name).toBe('Alice');
  });

  it('should never crown anyone in an abandoned game', () => {
    expect(getGameWinner(makeGame({ status: 'abandoned', winnerId: 'p1' }))).toBeUndefined();
  });
});

describe('filterGames', () => {
  const now = new Date('2026-10-16T18:00:00');
  const games = [
    makeGame({ id: 'today', createdAt: new Date('2026-10-16T09:00:00').toISOString() }),
    makeGame({
      id: 'abandoned',
      status: 'abandoned',
      winnerId: null,
      createdAt: new Date('2026-10-12T09:00:00').toISOString(),
      players: [{ id: 'p3', name: 'Carol', avatar: '⭐', lives: 3, eliminated: false }],
    }),
    makeGame({ id: 'old', createdAt: new Date('2026-08-01T09:00:00').toISOString() }),
  ];

  it('should return everything without filters', () => {
    expect(filterGames(games, noFilters, now).map((g) => g.id)).toEqual(['today', 'abandoned', 'old']);
  });

  it('should find abandoned games with the Abandoned filter', () => {
    expect(filterGames(games, { ...noFilters, status: 'abandoned' }, now).map((g) => g.id)).toEqual([
      'abandoned',
    ]);
    expect(filterGames(games, { ...noFilters, status: 'completed' }, now).map((g) => g.id)).toEqual([
      'today',
      'old',
    ]);
  });

  it('should match player names case-insensitively', () => {
    expect(filterGames(games, { ...noFilters, query: '  carol ' }, now).map((g) => g.id)).toEqual([
      'abandoned',
    ]);
  });

  it('should filter by date range', () => {
    expect(filterGames(games, { ...noFilters, date: 'today' }, now).map((g) => g.id)).toEqual(['today']);
    expect(filterGames(games, { ...noFilters, date: 'week' }, now).map((g) => g.id)).toEqual([
      'today',
      'abandoned',
    ]);
    expect(filterGames(games, { ...noFilters, date: 'month' }, now)).toHaveLength(2);
  });
});

describe('staggerDelay', () => {
  it('should grow with the index and then stop', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBeCloseTo(0.1);
    expect(staggerDelay(49)).toBeLessThanOrEqual(0.4);
    expect(staggerDelay(1000)).toBe(staggerDelay(49));
  });
});

describe('formatDuration', () => {
  it('should format minutes and seconds', () => {
    expect(formatDuration('2026-10-16T10:00:00.000Z', '2026-10-16T10:12:30.000Z')).toBe('12m 30s');
  });

  it('should not go negative on clock skew', () => {
    expect(formatDuration('2026-10-16T10:00:05.000Z', '2026-10-16T10:00:00.000Z')).toBe('0m 0s');
  });
});
