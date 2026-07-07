/**
 * Tests for local achievement checks
 */

import { checkLocalAchievements } from '../achievements';
import { Game, GameHistoryEntry, DEFAULT_RULESET, Player } from '../types';

// achievements.ts imports the Supabase browser client at module level;
// checkLocalAchievements itself never uses it
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'winner-id',
    name: 'Winner',
    avatar: '🎱',
    lives: 3,
    eliminated: false,
    userId: 'user-1',
    ...overrides,
  };
}

function makeHistoryEntry(overrides: Partial<GameHistoryEntry> = {}): GameHistoryEntry {
  return {
    id: 'h1',
    action: 'pot',
    playerId: 'winner-id',
    playerName: 'Winner',
    timestamp: '2026-01-01T00:00:00.000Z',
    livesBefore: 3,
    livesAfter: 3,
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
    status: 'completed',
    players: [makePlayer(), makePlayer({ id: 'loser-id', name: 'Loser', lives: 0, eliminated: true, userId: null })],
    currentPlayerIndex: 0,
    winnerId: 'winner-id',
    ruleset: DEFAULT_RULESET,
    history: [],
    ...overrides,
  };
}

describe('checkLocalAchievements', () => {
  it('should return nothing when the user is not the winner', () => {
    const game = makeGame();
    expect(checkLocalAchievements(game, 'other-user')).toEqual([]);
  });

  it('should grant survivor for winning with exactly 1 life', () => {
    const game = makeGame({
      players: [makePlayer({ lives: 1 }), makePlayer({ id: 'loser-id', lives: 0, eliminated: true, userId: null })],
    });
    expect(checkLocalAchievements(game, 'user-1')).toContain('survivor');
  });

  it('should grant perfect_game when the winner never lost a life', () => {
    const game = makeGame({
      history: [
        makeHistoryEntry({ action: 'pot' }),
        makeHistoryEntry({ id: 'h2', action: 'miss', playerId: 'loser-id', playerName: 'Loser', livesBefore: 1, livesAfter: 0 }),
      ],
    });
    expect(checkLocalAchievements(game, 'user-1')).toContain('perfect_game');
  });

  it('should NOT grant perfect_game when lives were lost and regained', () => {
    // Winner dropped to 2 lives, then potted blacks back up to 3
    const game = makeGame({
      history: [
        makeHistoryEntry({ id: 'h1', action: 'miss', livesBefore: 3, livesAfter: 2 }),
        makeHistoryEntry({ id: 'h2', action: 'pot_black', livesBefore: 2, livesAfter: 3 }),
      ],
    });
    expect(checkLocalAchievements(game, 'user-1')).not.toContain('perfect_game');
  });

  it('should grant pot_black_master for 5+ pot blacks by the winner', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeHistoryEntry({ id: `h${i}`, action: 'pot_black', livesBefore: 3, livesAfter: 3 })
    );
    const game = makeGame({ history });
    expect(checkLocalAchievements(game, 'user-1')).toContain('pot_black_master');
  });

  it('should not count other players pot blacks', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeHistoryEntry({ id: `h${i}`, action: 'pot_black', playerId: 'loser-id', playerName: 'Loser' })
    );
    const game = makeGame({ history });
    expect(checkLocalAchievements(game, 'user-1')).not.toContain('pot_black_master');
  });
});
