/**
 * Tests for Storage utilities
 */

import {
  saveCurrentGame,
  loadCurrentGame,
  clearCurrentGame,
  saveToHistory,
  loadGameHistory,
  clearGameHistory,
  getGameFromHistory,
  deleteGameFromHistory,
  hasCurrentGame,
  getPendingSyncIds,
  markPendingSync,
  unmarkPendingSync,
  getDeletedGameIds,
  markGameDeleted,
  clearGameDeleted,
  loadRoster,
  findRosterPlayer,
  resolveRosterPlayerId,
  rememberRosterPlayers,
  getPlayerNamesSuggestions,
} from '../storage';
import { createGame } from '../game-logic';
import { Game } from '../types';

describe('Storage', () => {
  beforeEach(() => {
    // Create a fresh mock localStorage for each test
    const storage: { [key: string]: string } = {};

    const localStorageMock = {
      getItem: (key: string): string | null => storage[key] || null,
      setItem: (key: string, value: string): void => {
        storage[key] = value;
      },
      removeItem: (key: string): void => {
        delete storage[key];
      },
      clear: (): void => {
        Object.keys(storage).forEach(key => delete storage[key]);
      },
      length: 0,
      key: jest.fn(),
    };

    // Replace global localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Clear all console spies
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveCurrentGame and loadCurrentGame', () => {
    it('should save and load a game', () => {
      const game = createGame([
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ]);

      saveCurrentGame(game);
      const loaded = loadCurrentGame();

      expect(loaded).toEqual(game);
    });

    it('should return null when no game is saved', () => {
      const loaded = loadCurrentGame();
      expect(loaded).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Store the original setItem
      const originalSetItem = global.localStorage.setItem;

      // Mock localStorage.setItem to throw an error
      global.localStorage.setItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      saveCurrentGame(game);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save game to localStorage:',
        expect.any(Error)
      );

      // Restore original implementation
      global.localStorage.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Store invalid JSON directly
      global.localStorage.setItem('killerpool_current_game', 'invalid json');

      const loaded = loadCurrentGame();
      expect(loaded).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearCurrentGame', () => {
    it('should clear the current game', () => {
      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      saveCurrentGame(game);

      expect(loadCurrentGame()).not.toBeNull();

      clearCurrentGame();
      expect(loadCurrentGame()).toBeNull();
    });

    it('should handle errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const originalRemoveItem = global.localStorage.removeItem;

      global.localStorage.removeItem = jest.fn(() => {
        throw new Error('Failed to remove');
      });

      clearCurrentGame();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to clear game from localStorage:',
        expect.any(Error)
      );

      global.localStorage.removeItem = originalRemoveItem;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('hasCurrentGame', () => {
    it('should return true when a game exists', () => {
      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      saveCurrentGame(game);

      expect(hasCurrentGame()).toBe(true);
    });

    it('should return false when no game exists', () => {
      expect(hasCurrentGame()).toBe(false);
    });
  });

  describe('saveToHistory and loadGameHistory', () => {
    it('should save completed game to history', () => {
      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game.status = 'completed';

      saveToHistory(game);
      const history = loadGameHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(game);
    });

    it('should not save non-completed games', () => {
      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game.status = 'active';

      saveToHistory(game);
      const history = loadGameHistory();

      expect(history).toHaveLength(0);
    });

    it('should add new games to the beginning of history', () => {
      const game1 = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game1.status = 'completed';
      game1.id = 'game-1';

      const game2 = createGame([{ name: 'Player 2', avatar: '🎯' }]);
      game2.status = 'completed';
      game2.id = 'game-2';

      saveToHistory(game1);
      saveToHistory(game2);

      const history = loadGameHistory();
      expect(history[0].id).toBe('game-2');
      expect(history[1].id).toBe('game-1');
    });

    it('should keep only last 50 games', () => {
      // Create 55 games
      for (let i = 0; i < 55; i++) {
        const game = createGame([{ name: `Player ${i}`, avatar: '🎱' }]);
        game.status = 'completed';
        game.id = `game-${i}`;
        saveToHistory(game);
      }

      const history = loadGameHistory();
      expect(history).toHaveLength(50);
      expect(history[0].id).toBe('game-54'); // Most recent
      expect(history[49].id).toBe('game-5'); // 50th from the end
    });

    it('should return empty array when no history exists', () => {
      const history = loadGameHistory();
      expect(history).toEqual([]);
    });

    it('should handle storage errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const originalSetItem = global.localStorage.setItem;

      global.localStorage.setItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game.status = 'completed';

      saveToHistory(game);

      // The write goes through saveGameHistory, which owns the history key
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save game history:',
        expect.any(Error)
      );

      global.localStorage.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      global.localStorage.setItem('killerpool_game_history', 'invalid json');

      const history = loadGameHistory();
      expect(history).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearGameHistory', () => {
    it('should clear all game history', () => {
      const game1 = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game1.status = 'completed';
      const game2 = createGame([{ name: 'Player 2', avatar: '🎯' }]);
      game2.status = 'completed';

      saveToHistory(game1);
      saveToHistory(game2);

      expect(loadGameHistory()).toHaveLength(2);

      clearGameHistory();
      expect(loadGameHistory()).toHaveLength(0);
    });

    it('should handle errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const originalRemoveItem = global.localStorage.removeItem;

      global.localStorage.removeItem = jest.fn(() => {
        throw new Error('Failed to remove');
      });

      clearGameHistory();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to clear game history:',
        expect.any(Error)
      );

      global.localStorage.removeItem = originalRemoveItem;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getGameFromHistory', () => {
    it('should retrieve a specific game by ID', () => {
      const game1 = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game1.status = 'completed';
      game1.id = 'game-1';

      const game2 = createGame([{ name: 'Player 2', avatar: '🎯' }]);
      game2.status = 'completed';
      game2.id = 'game-2';

      saveToHistory(game1);
      saveToHistory(game2);

      const retrieved = getGameFromHistory('game-1');
      expect(retrieved).toEqual(game1);
    });

    it('should return null if game not found', () => {
      const retrieved = getGameFromHistory('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('deleteGameFromHistory', () => {
    it('should delete a specific game from history', () => {
      const game1 = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game1.status = 'completed';
      game1.id = 'game-1';

      const game2 = createGame([{ name: 'Player 2', avatar: '🎯' }]);
      game2.status = 'completed';
      game2.id = 'game-2';

      saveToHistory(game1);
      saveToHistory(game2);

      expect(loadGameHistory()).toHaveLength(2);

      deleteGameFromHistory('game-1');

      const history = loadGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('game-2');
    });

    it('should handle non-existent game ID gracefully', () => {
      const game = createGame([{ name: 'Player 1', avatar: '🎱' }]);
      game.status = 'completed';
      saveToHistory(game);

      deleteGameFromHistory('non-existent-id');

      expect(loadGameHistory()).toHaveLength(1);
    });

    it('should handle errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const originalSetItem = global.localStorage.setItem;

      global.localStorage.setItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      deleteGameFromHistory('game-1');

      // Both writes it makes (history, tombstone) swallow and log the failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save game history:',
        expect.any(Error)
      );

      global.localStorage.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleted game tombstones', () => {
    const completedGame = (id: string): Game => {
      const game = createGame([
        { name: 'Player 1', avatar: '🎱' },
        { name: 'Player 2', avatar: '🎯' },
      ]);
      return { ...game, id, status: 'completed' };
    };

    it('should record a tombstone when a game is deleted', () => {
      saveToHistory(completedGame('game-1'));

      deleteGameFromHistory('game-1');

      expect(getDeletedGameIds().has('game-1')).toBe(true);
      expect(loadGameHistory()).toHaveLength(0);
    });

    it('should drop the game from the pending sync queue when deleted', () => {
      saveToHistory(completedGame('game-1'));
      markPendingSync('game-1');

      deleteGameFromHistory('game-1');

      expect(getPendingSyncIds()).not.toContain('game-1');
    });

    it('should clear the tombstone when the game is saved again', () => {
      markGameDeleted('game-1');

      saveToHistory(completedGame('game-1'));

      expect(getDeletedGameIds().has('game-1')).toBe(false);
    });

    it('should let a tombstone be cleared explicitly', () => {
      markGameDeleted('game-1');
      clearGameDeleted('game-1');

      expect(getDeletedGameIds().has('game-1')).toBe(false);
    });

    it('should read the legacy plain-string format', () => {
      localStorage.setItem('killerpool_deleted_games', JSON.stringify(['game-1']));

      expect(getDeletedGameIds().has('game-1')).toBe(true);
    });

    it('should survive corrupted data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      localStorage.setItem('killerpool_deleted_games', 'not json');

      expect(getDeletedGameIds().size).toBe(0);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('player roster', () => {
    const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

    it('should mint an id for somebody new', () => {
      const id = resolveRosterPlayerId('Misha');

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should reuse the id of a known player', () => {
      rememberRosterPlayers([{ id: uuid(1), name: 'Misha', avatar: '🎱' }]);

      expect(resolveRosterPlayerId('Misha')).toBe(uuid(1));
    });

    it('should match names regardless of case and padding', () => {
      rememberRosterPlayers([{ id: uuid(1), name: 'Misha', avatar: '🎱' }]);

      expect(resolveRosterPlayerId('  mIsHa ')).toBe(uuid(1));
      expect(findRosterPlayer('MISHA')?.id).toBe(uuid(1));
    });

    it('should keep the original id when a player is seen again', () => {
      // The id is what the leaderboard groups by — a second sighting must not
      // split the same person into two entries
      rememberRosterPlayers([{ id: uuid(1), name: 'Misha', avatar: '🎱' }]);
      rememberRosterPlayers([{ id: uuid(2), name: 'Misha', avatar: '🎯' }]);

      const roster = loadRoster();
      expect(roster).toHaveLength(1);
      expect(roster[0].id).toBe(uuid(1));
      expect(roster[0].avatar).toBe('🎯');
    });

    it('should ignore blank names', () => {
      rememberRosterPlayers([{ id: uuid(1), name: '   ', avatar: '🎱' }]);

      expect(loadRoster()).toHaveLength(0);
      expect(findRosterPlayer('   ')).toBeNull();
    });

    it('should offer known players for autocomplete', () => {
      rememberRosterPlayers([
        { id: uuid(1), name: 'Misha', avatar: '🎱' },
        { id: uuid(2), name: 'Anton', avatar: '🎯' },
      ]);

      expect(getPlayerNamesSuggestions()).toEqual(['Anton', 'Misha']);
    });

    it('should survive corrupted data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      localStorage.setItem('killerpool_roster', 'not json');

      expect(loadRoster()).toEqual([]);
      expect(resolveRosterPlayerId('Misha')).toBeTruthy();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('pending sync queue', () => {
    it('should return empty array when nothing is pending', () => {
      expect(getPendingSyncIds()).toEqual([]);
    });

    it('should mark and unmark games as pending sync', () => {
      markPendingSync('game-1');
      markPendingSync('game-2');

      expect(getPendingSyncIds()).toEqual(['game-1', 'game-2']);

      unmarkPendingSync('game-1');

      expect(getPendingSyncIds()).toEqual(['game-2']);
    });

    it('should not duplicate a game id marked twice', () => {
      markPendingSync('game-1');
      markPendingSync('game-1');

      expect(getPendingSyncIds()).toEqual(['game-1']);
    });

    it('should ignore unmarking a game that is not pending', () => {
      markPendingSync('game-1');
      unmarkPendingSync('game-2');

      expect(getPendingSyncIds()).toEqual(['game-1']);
    });

    it('should return empty array for corrupted data', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      global.localStorage.setItem('killerpool_pending_sync', 'not-json');
      expect(getPendingSyncIds()).toEqual([]);

      global.localStorage.setItem('killerpool_pending_sync', '{"not":"array"}');
      expect(getPendingSyncIds()).toEqual([]);

      consoleErrorSpy.mockRestore();
    });
  });
});
