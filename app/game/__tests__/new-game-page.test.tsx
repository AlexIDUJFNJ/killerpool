/**
 * Tests for the new game form
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewGamePage from '../new/page';
import { getGuestId } from '@/lib/storage';
import { Game } from '@/lib/types';

const mockPush = jest.fn();
const mockStartGame = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/game-context', () => ({
  useGame: () => ({ startGame: mockStartGame }),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

jest.mock('motion/react', () => {
  const ReactActual = jest.requireActual('react');
  return {
    motion: {
      div: ({ children, initial, animate, transition, ...rest }: Record<string, unknown>) =>
        ReactActual.createElement('div', rest, children),
    },
  };
});

function typeName(index: number, name: string) {
  fireEvent.change(screen.getByPlaceholderText(`Player ${index + 1} name`), {
    target: { value: name },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NewGamePage', () => {
  it('should explain a refused start next to the form, not in an alert', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<NewGamePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Player 1 name')).toBeInTheDocument());

    typeName(0, 'Anna');
    typeName(1, 'anna');
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Two players are called "anna"');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockStartGame).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('should clear the error once the form changes', async () => {
    render(<NewGamePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Player 1 name')).toBeInTheDocument());

    typeName(0, 'Anna');
    typeName(1, 'Anna');
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    typeName(1, 'Boris');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should ask for the creator\'s own name when their row is empty', async () => {
    render(<NewGamePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Player 1 name')).toBeInTheDocument());

    // Row 1 is marked "you" by default; leave it empty and add two others
    fireEvent.click(screen.getByRole('button', { name: /add player/i }));
    typeName(1, 'Anna');
    typeName(2, 'Boris');
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your own name');
    expect(mockStartGame).not.toHaveBeenCalled();
  });

  it('should record who created a game even when nobody is marked as them', async () => {
    render(<NewGamePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Player 1 name')).toBeInTheDocument());

    typeName(0, 'Anna');
    typeName(1, 'Boris');
    fireEvent.click(screen.getByRole('button', { name: 'You' }));
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    const game: Game = mockStartGame.mock.calls[0][0];
    expect(game.players.every(p => !p.userId)).toBe(true);
    expect(game.createdBy).toBe(getGuestId());
    expect(mockPush).toHaveBeenCalledWith(`/game/${game.id}`);
  });

  describe('accessibility', () => {
    it('should give every name field a label of its own', async () => {
      render(<NewGamePage />);

      // Placeholders vanish while typing; the accessible name has to stay
      expect(await screen.findByRole('textbox', { name: 'Player 1 name' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Player 2 name' })).toBeInTheDocument();
    });

    it('should name the avatar and remove buttons after their row', async () => {
      render(<NewGamePage />);
      fireEvent.click(await screen.findByRole('button', { name: /add player/i }));

      expect(screen.getByRole('button', { name: 'Choose avatar for player 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove player 3' })).toBeInTheDocument();
    });

    it('should go back with a plain link, not a button inside one', async () => {
      const { container } = render(<NewGamePage />);

      expect(await screen.findByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
      expect(container.querySelector('a button, button a')).toBeNull();
    });
  });
});
