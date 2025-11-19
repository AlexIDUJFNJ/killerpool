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

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save game to history:',
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

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to delete game from history:',
        expect.any(Error)
      );

      global.localStorage.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });
  });
});
