/**
 * Tests for Game Logic
 */

import {
  createPlayer,
  createGame,
  applyAction,
  getCurrentPlayer,
  getActivePlayers,
  getEliminatedPlayers,
  getNextPlayers,
  getWinner,
  undoLastAction,
  calculateStats,
} from '../game-logic';
import { DEFAULT_RULESET, Game, Player } from '../types';

// Mock crypto.randomUUID for consistent testing
const mockUUID = 'test-uuid-123';
let uuidCounter = 0;

// Store original crypto
const originalCrypto = global.crypto;

describe('Game Logic', () => {
  beforeEach(() => {
    uuidCounter = 0;
    jest.clearAllMocks();
    // Mock crypto.randomUUID
    global.crypto = {
      ...originalCrypto,
      randomUUID: jest.fn(() => `${mockUUID}-${uuidCounter++}`),
    } as any;
  });

  afterEach(() => {
    // Restore original crypto
    global.crypto = originalCrypto;
  });

  describe('createPlayer', () => {
    it('should create a new player with correct properties', () => {
      const player = createPlayer('John', '🎱', 3);

      expect(player).toMatchObject({
        name: 'John',
        avatar: '🎱',
        lives: 3,
        eliminated: false,
        userId: undefined,
      });
      expect(player.id).toBeTruthy();
      expect(typeof player.id).toBe('string');
    });

    it('should create a player with userId when provided', () => {
      const player = createPlayer('Jane', '🎯', 3, 'user-123');

      expect(player.userId).toBe('user-123');
    });

    it('should handle different starting lives', () => {
      const player = createPlayer('Bob', '⚡', 5);

      expect(player.lives).toBe(5);
    });
  });

  describe('createGame', () => {
    it('should create a new game with multiple players', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];

      const game = createGame(players);

      expect(game).toMatchObject({
        status: 'active',
        currentPlayerIndex: 0,
        history: [],
        ruleset: DEFAULT_RULESET,
      });
      expect(game.id).toBeTruthy();
      expect(typeof game.id).toBe('string');
      expect(game.players).toHaveLength(2);
      expect(game.players[0].name).toBe('Player 1');
      expect(game.players[1].name).toBe('Player 2');
    });

    it('should initialize players with starting lives from ruleset', () => {
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      const game = createGame(players);

      expect(game.players[0].lives).toBe(DEFAULT_RULESET.params.starting_lives);
    });

    it('should use custom ruleset when provided', () => {
      const customRuleset = {
        ...DEFAULT_RULESET,
        params: { ...DEFAULT_RULESET.params, starting_lives: 5 },
      };
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      const game = createGame(players, customRuleset);

      expect(game.players[0].lives).toBe(5);
      expect(game.ruleset.params.starting_lives).toBe(5);
    });
  });

  describe('applyAction', () => {
    let game: Game;

    beforeEach(() => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
        { name: 'Player 3', avatar: '⚡' },
      ];
      game = createGame(players);
    });

    it('should apply MISS action and decrease lives by 1', () => {
      const updatedGame = applyAction(game, 'miss');
      const player = updatedGame.players[0];

      expect(player.lives).toBe(2); // 3 - 1
      expect(updatedGame.history).toHaveLength(1);
      expect(updatedGame.history[0].action).toBe('miss');
      expect(updatedGame.history[0].livesBefore).toBe(3);
      expect(updatedGame.history[0].livesAfter).toBe(2);
    });

    it('should apply POT action and keep lives unchanged', () => {
      const updatedGame = applyAction(game, 'pot');
      const player = updatedGame.players[0];

      expect(player.lives).toBe(3); // 3 + 0
      expect(updatedGame.history[0].action).toBe('pot');
    });

    it('should apply POT_BLACK action and increase lives by 1', () => {
      const updatedGame = applyAction(game, 'pot_black');
      const player = updatedGame.players[0];

      expect(player.lives).toBe(4); // 3 + 1
      expect(updatedGame.history[0].action).toBe('pot_black');
    });

    it('should respect max lives limit', () => {
      // Apply multiple POT_BLACK actions
      let updatedGame = game;
      for (let i = 0; i < 10; i++) {
        updatedGame = applyAction(updatedGame, 'pot_black');
        updatedGame = {
          ...updatedGame,
          currentPlayerIndex: 0, // Keep on same player
        };
      }

      const player = updatedGame.players[0];
      expect(player.lives).toBe(DEFAULT_RULESET.params.max_lives);
    });

    it('should eliminate player when lives reach 0', () => {
      let updatedGame = applyAction(game, 'miss'); // 2 lives
      updatedGame = { ...updatedGame, currentPlayerIndex: 0 };
      updatedGame = applyAction(updatedGame, 'miss'); // 1 life
      updatedGame = { ...updatedGame, currentPlayerIndex: 0 };
      updatedGame = applyAction(updatedGame, 'miss'); // 0 lives

      const player = updatedGame.players[0];
      expect(player.lives).toBe(0);
      expect(player.eliminated).toBe(true);
    });

    it('should advance to next active player', () => {
      const updatedGame = applyAction(game, 'miss');

      expect(updatedGame.currentPlayerIndex).toBe(1);
    });

    it('should skip eliminated players', () => {
      // Eliminate player 2
      let updatedGame = applyAction(game, 'miss'); // Player 1 -> Player 2
      // Now at player 2, eliminate them
      for (let i = 0; i < 3; i++) {
        updatedGame = applyAction(updatedGame, 'miss');
        // After elimination, currentPlayerIndex should already skip to player 3
        if (i < 2) {
          updatedGame = { ...updatedGame, currentPlayerIndex: 1 };
        }
      }

      // Now player 2 should be eliminated
      expect(updatedGame.players[1].eliminated).toBe(true);

      // Current player should have skipped to player 3 (index 2) or back to player 1 (index 0)
      expect(updatedGame.players[updatedGame.currentPlayerIndex].eliminated).toBe(false);
    });

    it('should mark game as completed when only one player remains', () => {
      // Eliminate all but one player
      let updatedGame = game;

      // Eliminate player 2
      updatedGame = { ...updatedGame, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        updatedGame = applyAction(updatedGame, 'miss');
        updatedGame = { ...updatedGame, currentPlayerIndex: 1 };
      }

      // Eliminate player 3
      updatedGame = { ...updatedGame, currentPlayerIndex: 2 };
      for (let i = 0; i < 3; i++) {
        updatedGame = applyAction(updatedGame, 'miss');
        updatedGame = { ...updatedGame, currentPlayerIndex: 2 };
      }

      expect(updatedGame.status).toBe('completed');
      expect(updatedGame.winnerId).toBe(game.players[0].id);
    });

    it('should throw error for eliminated player', () => {
      // Eliminate player 1
      let updatedGame = game;
      for (let i = 0; i < 3; i++) {
        updatedGame = applyAction(updatedGame, 'miss');
        updatedGame = { ...updatedGame, currentPlayerIndex: 0 };
      }

      // Try to apply action to eliminated player
      expect(() => applyAction(updatedGame, 'miss')).toThrow('Invalid player state');
    });
  });

  describe('getCurrentPlayer', () => {
    it('should return the current active player', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      const game = createGame(players);

      const currentPlayer = getCurrentPlayer(game);
      expect(currentPlayer?.name).toBe('Player 1');
    });

    it('should return undefined if no current player', () => {
      const game = createGame([]);
      const currentPlayer = getCurrentPlayer(game);
      expect(currentPlayer).toBeUndefined();
    });
  });

  describe('getActivePlayers', () => {
    it('should return all non-eliminated players', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
        { name: 'Player 3', avatar: '⚡' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 1 };
      }

      const activePlayers = getActivePlayers(game);
      expect(activePlayers).toHaveLength(2);
      expect(activePlayers.map(p => p.name)).toEqual(['Player 1', 'Player 3']);
    });
  });

  describe('getEliminatedPlayers', () => {
    it('should return all eliminated players', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 1
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 0 };
      }

      const eliminatedPlayers = getEliminatedPlayers(game);
      expect(eliminatedPlayers).toHaveLength(1);
      expect(eliminatedPlayers[0].name).toBe('Player 1');
    });
  });

  describe('getNextPlayers', () => {
    it('should return the next N active players', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
        { name: 'Player 3', avatar: '⚡' },
      ];
      const game = createGame(players);

      const nextPlayers = getNextPlayers(game, 2);
      expect(nextPlayers).toHaveLength(2);
      expect(nextPlayers[0].name).toBe('Player 2');
      expect(nextPlayers[1].name).toBe('Player 3');
    });

    it('should skip eliminated players', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
        { name: 'Player 3', avatar: '⚡' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        if (i < 2) {
          game = { ...game, currentPlayerIndex: 1 };
        }
      }

      game = { ...game, currentPlayerIndex: 0 };
      const nextPlayers = getNextPlayers(game, 2);
      // Should get Player 3 and then wrap around to Player 1 (2 active players)
      expect(nextPlayers).toHaveLength(2);
      expect(nextPlayers[0].name).toBe('Player 3');
      expect(nextPlayers[1].name).toBe('Player 1');
      // Verify Player 2 is not in the list
      expect(nextPlayers.find(p => p.name === 'Player 2')).toBeUndefined();
    });

    it('should wrap around to beginning if necessary', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
        { name: 'Player 3', avatar: '⚡' },
      ];
      const game = createGame(players);
      game.currentPlayerIndex = 2; // Player 3

      const nextPlayers = getNextPlayers(game, 2);
      expect(nextPlayers).toHaveLength(2);
      // Should wrap around to Player 1 and Player 2
      expect(nextPlayers[0].name).toBe('Player 1');
      expect(nextPlayers[1].name).toBe('Player 2');
    });
  });

  describe('getWinner', () => {
    it('should return winner when game is completed', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 1 };
      }

      const winner = getWinner(game);
      expect(winner?.name).toBe('Player 1');
    });

    it('should return undefined when game is active', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      const game = createGame(players);

      const winner = getWinner(game);
      expect(winner).toBeUndefined();
    });
  });

  describe('undoLastAction', () => {
    it('should restore player lives to previous state', () => {
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      let game = createGame(players);

      game = applyAction(game, 'miss'); // 2 lives
      expect(game.players[0].lives).toBe(2);

      const undoneGame = undoLastAction(game);
      expect(undoneGame.players[0].lives).toBe(3);
      expect(undoneGame.history).toHaveLength(0);
    });

    it('should restore eliminated status', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 1
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 0 };
      }

      expect(game.players[0].eliminated).toBe(true);

      const undoneGame = undoLastAction(game);
      expect(undoneGame.players[0].eliminated).toBe(false);
      expect(undoneGame.players[0].lives).toBe(1);
    });

    it('should restore game status from completed to active', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 1 };
      }

      expect(game.status).toBe('completed');

      const undoneGame = undoLastAction(game);
      expect(undoneGame.status).toBe('active');
      expect(undoneGame.winnerId).toBeUndefined();
    });

    it('should do nothing if history is empty', () => {
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      const game = createGame(players);

      const undoneGame = undoLastAction(game);
      expect(undoneGame).toEqual(game);
    });

    it('should handle multiple undos', () => {
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      let game = createGame(players);

      game = applyAction(game, 'miss'); // 2 lives
      game = { ...game, currentPlayerIndex: 0 };
      game = applyAction(game, 'miss'); // 1 life

      expect(game.players[0].lives).toBe(1);

      let undoneGame = undoLastAction(game); // Back to 2 lives
      expect(undoneGame.players[0].lives).toBe(2);

      undoneGame = undoLastAction(undoneGame); // Back to 3 lives
      expect(undoneGame.players[0].lives).toBe(3);
    });
  });

  describe('calculateStats', () => {
    it('should calculate correct game statistics', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      game = applyAction(game, 'miss');
      game = applyAction(game, 'pot');
      game = applyAction(game, 'pot_black');
      game = applyAction(game, 'miss');

      const stats = calculateStats(game);
      expect(stats.totalActions).toBe(4);
      expect(stats.totalMisses).toBe(2);
      expect(stats.totalPots).toBe(1);
      expect(stats.totalBlackPots).toBe(1);
    });

    it('should include winner in stats for completed game', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 1 };
      }

      const stats = calculateStats(game);
      expect(stats.winner?.name).toBe('Player 1');
    });

    it('should calculate duration for completed game', () => {
      const players = [
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ];
      let game = createGame(players);

      // Eliminate player 2
      game = { ...game, currentPlayerIndex: 1 };
      for (let i = 0; i < 3; i++) {
        game = applyAction(game, 'miss');
        game = { ...game, currentPlayerIndex: 1 };
      }

      const stats = calculateStats(game);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });

    it('should not include duration for active game', () => {
      const players = [{ name: 'Player 1', avatar: '🎱' }];
      const game = createGame(players);

      const stats = calculateStats(game);
      expect(stats.duration).toBeUndefined();
    });
  });
});
