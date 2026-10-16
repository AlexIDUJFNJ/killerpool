/**
 * Tests for the home page
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import Home from '../page';
import { useGame } from '@/contexts/game-context';

jest.mock('@/contexts/game-context', () => ({ useGame: jest.fn() }));
jest.mock('@/components/pwa-install-button', () => ({ PWAInstallButton: () => null }));
jest.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));

const mockUseGame = useGame as jest.Mock;

const activeGame = {
  id: 'g1',
  status: 'active',
  players: [
    { id: 'p1', name: 'Ann', lives: 3, eliminated: false },
    { id: 'p2', name: 'Bob', lives: 0, eliminated: true },
  ],
};

describe('Home', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render its content on the server instead of a loading placeholder', () => {
    // The provider is still loading during SSR: no saved game, no session yet
    mockUseGame.mockReturnValue({ game: null, isLoading: true, currentUserId: undefined });

    const html = renderToString(<Home />);

    expect(html).toContain('Start New Game');
    expect(html).toContain('Classic Rules');
    expect(html).not.toContain('Loading...');
  });

  it('should hold the resume banner and the account button until the provider knows', () => {
    mockUseGame.mockReturnValue({ game: activeGame, isLoading: true, currentUserId: undefined });

    render(<Home />);

    expect(screen.queryByText('Game in Progress')).toBeNull();
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /profile/i })).toBeNull();
  });

  it('should offer to resume an active game', () => {
    mockUseGame.mockReturnValue({ game: activeGame, isLoading: false, currentUserId: null });

    render(<Home />);

    expect(screen.getByText('Game in Progress')).toBeInTheDocument();
    expect(screen.getByText('1 players remaining')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /resume/i })).toHaveAttribute('href', '/game/g1');
  });

  it('should show Sign In to a guest and Profile to a signed-in user', () => {
    mockUseGame.mockReturnValue({ game: null, isLoading: false, currentUserId: null });
    const { unmount } = render(<Home />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth');
    unmount();

    mockUseGame.mockReturnValue({ game: null, isLoading: false, currentUserId: 'user-1' });
    render(<Home />);
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile');
  });
});
