/**
 * Tests for the game screen: winner screen, rematch, ending a game
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GamePage from '../[id]/page';
import { createGame, applyAction } from '@/lib/game-logic';
import { Game } from '@/lib/types';

const mockPush = jest.fn();
let mockParams: { id: string } = { id: '' };
let mockContext: Record<string, unknown> = {};
let mockUser: { id: string } | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

jest.mock('@/contexts/game-context', () => ({
  useGame: () => mockContext,
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
  }),
}));

jest.mock('@/lib/haptic', () => ({
  haptics: { tap: jest.fn(), victory: jest.fn() },
}));

// Plain elements instead of animated ones, and no exit animations to wait for
jest.mock('motion/react', () => {
  const ReactActual = jest.requireActual('react');
  const MOTION_PROPS = [
    'initial', 'animate', 'exit', 'transition', 'drag', 'dragConstraints',
    'dragElastic', 'onDragStart', 'onDragEnd', 'whileTap', 'layout', 'layoutId',
  ];
  // One component per tag: a fresh type on every access would remount the
  // subtree on each render and detach the nodes a test is holding
  const components: Record<string, unknown> = {};
  const motion = new Proxy({}, {
    get: (_target, tag: string) =>
      (components[tag] ??= ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const rest = { ...props };
        MOTION_PROPS.forEach(key => delete rest[key]);
        return ReactActual.createElement(tag, { ...rest, ref });
      })),
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@/components/game/invite-modal', () => ({ InviteModal: () => null }));
jest.mock('@/components/game/black-ball-celebration', () => ({ BlackBallCelebration: () => null }));
jest.mock('@/components/game/swipeable-player-card', () => ({
  SwipeablePlayerCard: ({ name }: { name: string }) => <div>{name}</div>,
}));

const ME = '0a0a0a0a-0000-4000-8000-00000000000a';

/** A game the signed-in user created and is marked in, as player 0 */
function myGame(): Game {
  return createGame(
    [
      { name: 'Me', avatar: '🎱', isOwner: true },
      { name: 'Rival', avatar: '🎯' },
    ],
    undefined,
    ME
  );
}

function wonBy(game: Game, winnerIndex: number): Game {
  const loser = winnerIndex === 0 ? 1 : 0;
  let finished = game;
  for (let i = 0; i < 3; i++) {
    finished = applyAction({ ...finished, currentPlayerIndex: loser }, 'miss');
  }
  return finished;
}

function setUp(game: Game, overrides: Record<string, unknown> = {}) {
  mockParams = { id: game.id };
  mockContext = {
    game,
    isLoading: false,
    isSpectatorMode: false,
    isSharingEnabled: false,
    currentUserId: mockUser?.id ?? null,
    resultSync: game.status === 'completed' ? 'saved' : null,
    performAction: jest.fn(),
    undoAction: jest.fn(),
    endGame: jest.fn(),
    loadGameFromSupabase: jest.fn(),
    setSpectatorGame: jest.fn(),
    clearSpectatorGame: jest.fn(),
    addPlayer: jest.fn(),
    ...overrides,
  };
  return mockContext;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: ME };
});

describe('winner screen', () => {
  it('should let the host undo the shot that decided the game', async () => {
    const ctx = setUp(wonBy(myGame(), 0));
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: /undo last shot/i }));

    expect(ctx.undoAction).toHaveBeenCalledTimes(1);
  });

  it('should not offer undo to a spectator', async () => {
    setUp(wonBy(myGame(), 0), { isSpectatorMode: true, resultSync: null });
    render(<GamePage />);

    await screen.findByText(/wins!/i);
    expect(screen.queryByRole('button', { name: /undo last shot/i })).not.toBeInTheDocument();
  });

  it('should not claim the win is saved before the upload is confirmed', async () => {
    setUp(wonBy(myGame(), 0), { resultSync: 'saving' });
    render(<GamePage />);

    expect(await screen.findByText(/saving the result/i)).toBeInTheDocument();
    expect(screen.queryByText(/your win is saved/i)).not.toBeInTheDocument();
  });

  it('should confirm a saved win and say when the leaderboard counts it', async () => {
    setUp(wonBy(myGame(), 0), { resultSync: 'saved' });
    render(<GamePage />);

    expect(await screen.findByText(/your win is saved to your stats/i)).toBeInTheDocument();
    expect(screen.getByText(/once they have played 3 games/i)).toBeInTheDocument();
    // The old wording promised a leaderboard entry that min_games withholds
    expect(screen.queryByText(/saved to the leaderboard/i)).not.toBeInTheDocument();
  });

  it('should say when the result is waiting to be uploaded', async () => {
    setUp(wonBy(myGame(), 0), { resultSync: 'retrying' });
    render(<GamePage />);

    expect(await screen.findByText(/uploads automatically/i)).toBeInTheDocument();
    expect(screen.queryByText(/your win is saved/i)).not.toBeInTheDocument();
  });
});

describe('rematch', () => {
  const rematchPlayers = () =>
    JSON.parse(sessionStorage.getItem('killerpool_rematch_players') ?? 'null');

  it('should carry the host\'s own row over to the rematch', async () => {
    setUp(wonBy(myGame(), 0));
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: /new game/i }));

    expect(rematchPlayers().map((p: { isOwner: boolean }) => p.isOwner)).toEqual([true, false]);
    expect(mockPush).toHaveBeenCalledWith('/game/new');
  });

  it('should mark nobody as "you" on a spectator\'s device', async () => {
    // The userId in a watched game is the host's: carrying it over made the
    // spectator's account play the rematch under the host's name
    setUp(wonBy(myGame(), 0), { isSpectatorMode: true, resultSync: null });
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: /new game/i }));

    expect(rematchPlayers().map((p: { isOwner: boolean }) => p.isOwner)).toEqual([false, false]);
  });
});

describe('ending a game', () => {
  const inPlay = () => applyAction(myGame(), 'pot');

  it('should ask in a sheet instead of a browser dialog', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
    const ctx = setUp(inPlay());
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'End Game' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('End this game?')).toBeInTheDocument();
    expect(ctx.endGame).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('should end the game and go home once confirmed', async () => {
    const ctx = setUp(inPlay());
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'End Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));

    expect(ctx.endGame).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('should keep playing when the host changes their mind', async () => {
    const ctx = setUp(inPlay());
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'End Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));

    expect(ctx.endGame).not.toHaveBeenCalled();
    expect(screen.queryByText('End this game?')).not.toBeInTheDocument();
  });

  it('should tell a spectator that the host ended the game', async () => {
    setUp({ ...inPlay(), status: 'abandoned' }, { isSpectatorMode: true });
    render(<GamePage />);

    expect(await screen.findByText(/host ended this game/i)).toBeInTheDocument();
  });
});

describe('leaving the page', () => {
  it('should leave spectator mode on unmount only', async () => {
    const game = inPlayGame();
    const ctx = setUp(game, { isSpectatorMode: true });
    const { rerender, unmount } = render(<GamePage />);
    await waitFor(() => expect(screen.getByText(/you are watching/i)).toBeInTheDocument());

    // A change of mode while mounted is not a reason to tear anything down
    mockContext = { ...ctx, isSpectatorMode: false };
    rerender(<GamePage />);
    mockContext = { ...ctx, isSpectatorMode: true };
    rerender(<GamePage />);
    expect(ctx.clearSpectatorGame).not.toHaveBeenCalled();

    unmount();
    expect(ctx.clearSpectatorGame).toHaveBeenCalledTimes(1);
  });

  it('should leave the host\'s own game alone on unmount', async () => {
    const ctx = setUp(inPlayGame());
    const { unmount } = render(<GamePage />);
    await screen.findByRole('button', { name: 'End Game' });

    unmount();

    expect(ctx.clearSpectatorGame).not.toHaveBeenCalled();
  });

  function inPlayGame() {
    return applyAction(myGame(), 'pot');
  }
});

describe('accessibility', () => {
  it('should name the icon-only header buttons', async () => {
    setUp(applyAction(myGame(), 'pot'));
    render(<GamePage />);

    expect(await screen.findByRole('button', { name: 'Share game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo last action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all players' })).toBeInTheDocument();
  });

  it('should not put a button inside a link', async () => {
    // The winner screen's sign-in prompt, shown to guests
    mockUser = null;
    setUp(wonBy(myGame(), 0), { currentUserId: null });
    const { container } = render(<GamePage />);

    expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth');
    expect(container.querySelector('a button, button a')).toBeNull();
  });

  it('should go back from the game screen with a plain link', async () => {
    setUp(applyAction(myGame(), 'pot'));
    const { container } = render(<GamePage />);

    expect(await screen.findByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(container.querySelector('a button, button a')).toBeNull();
  });
});
