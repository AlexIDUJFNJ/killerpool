/**
 * Tests for mapping Supabase games rows to the client Game type
 */

import { mapDbGameToGame } from '../game-mapper';
import { DEFAULT_RULESET, Player } from '../types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Player 1',
    avatar: '🎱',
    lives: 3,
    eliminated: false,
    userId: null,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T01:00:00.000Z',
    status: 'active' as const,
    participants: [makePlayer(), makePlayer({ id: 'player-2', name: 'Player 2' })],
    winner_id: null,
    ruleset_id: null,
    history: [],
    created_by: null,
    current_player_index: 0,
    ...overrides,
  };
}

describe('mapDbGameToGame', () => {
  it('should map snake_case row fields to the Game type', () => {
    const game = mapDbGameToGame(makeRow({ winner_id: 'player-1', created_by: 'user-1' }));

    expect(game.id).toBe('game-1');
    expect(game.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(game.updatedAt).toBe('2026-01-01T01:00:00.000Z');
    expect(game.players).toHaveLength(2);
    expect(game.winnerId).toBe('player-1');
    expect(game.createdBy).toBe('user-1');
    expect(game.ruleset).toBe(DEFAULT_RULESET);
  });

  it('should use current_player_index from the row', () => {
    const game = mapDbGameToGame(makeRow({ current_player_index: 1 }));
    expect(game.currentPlayerIndex).toBe(1);
  });

  it('should fall back to the first non-eliminated player when index is missing', () => {
    const game = mapDbGameToGame(
      makeRow({
        current_player_index: null,
        participants: [
          makePlayer({ id: 'p1', lives: 0, eliminated: true }),
          makePlayer({ id: 'p2', lives: 2 }),
        ],
      })
    );
    expect(game.currentPlayerIndex).toBe(1);
  });

  it('should clamp out-of-range index instead of pointing past the players array', () => {
    const game = mapDbGameToGame(makeRow({ current_player_index: 99 }));
    expect(game.currentPlayerIndex).toBe(0);
  });

  it('should not return a negative index when all players are eliminated', () => {
    const game = mapDbGameToGame(
      makeRow({
        current_player_index: null,
        participants: [
          makePlayer({ id: 'p1', lives: 0, eliminated: true }),
          makePlayer({ id: 'p2', lives: 0, eliminated: true }),
        ],
      })
    );
    expect(game.currentPlayerIndex).toBe(0);
  });

  it('should default null history to an empty array', () => {
    const game = mapDbGameToGame(makeRow({ history: null }));
    expect(game.history).toEqual([]);
  });
});
