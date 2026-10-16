/**
 * Tests for streaks and awards on the game screen: the streak on the current
 * player's card and in the players list, and the awards on the winner screen
 */

import * as React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GamePage from '../[id]/page';
import { createGame, applyAction, undoLastAction } from '@/lib/game-logic';
import { Game, GameAction } from '@/lib/types';

let mockParams: { id: string } = { id: '' };
let mockContext: Record<string, unknown> = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => mockParams,
}));

jest.mock('@/contexts/game-context', () => ({
  useGame: () => mockContext,
}));

jest.mock('@/lib/haptic', () => ({
  haptics: { tap: jest.fn(), victory: jest.fn() },
}));

// Plain elements instead of animated ones, as in game-page.test.tsx
jest.mock('motion/react', () => {
  const ReactActual = jest.requireActual('react');
  const MOTION_PROPS = [
    'initial', 'animate', 'exit', 'transition', 'drag', 'dragConstraints',
    'dragElastic', 'onDragStart', 'onDragEnd', 'whileTap', 'layout', 'layoutId',
  ];
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
// The swipe card's own streak display is tested with the card; here only
// what the page hands it
jest.mock('@/components/game/swipeable-player-card', () => ({
  SwipeablePlayerCard: ({ name, streak }: { name: string; streak?: number }) => (
    <div data-testid="swipe-card">{`${name}, streak ${streak}`}</div>
  ),
}));

const ACTIONS: Record<string, GameAction> = { p: 'pot', x: 'miss', b: 'pot_black' };

/** Shots as "<player><shot>", p pot, x miss, b black (see lib/__tests__/game-insights.test.ts) */
function play(game: Game, shots: string): Game {
  return shots.split(' ').reduce((g, shot) => {
    const index = g.players.findIndex((p) => p.name === shot[0]);
    return applyAction({ ...g, currentPlayerIndex: index }, ACTIONS[shot[1]]);
  }, game);
}

function newGame(...names: string[]): Game {
  return createGame(names.map((name) => ({ name, avatar: '🎱' })));
}

/** Whose turn it is, by name */
function turnOf(game: Game, name: string): Game {
  return { ...game, currentPlayerIndex: game.players.findIndex((p) => p.name === name) };
}

function setUp(game: Game, overrides: Record<string, unknown> = {}) {
  mockParams = { id: game.id };
  mockContext = {
    game,
    isLoading: false,
    isSpectatorMode: false,
    isSharingEnabled: false,
    currentUserId: null,
    resultSync: null,
    performAction: jest.fn(),
    undoAction: jest.fn(),
    endGame: jest.fn(),
    loadGameFromSupabase: jest.fn(),
    setSpectatorGame: jest.fn(),
    clearSpectatorGame: jest.fn(),
    addPlayer: jest.fn(),
    ...overrides,
  };
}

describe('streak on the game screen', () => {
  // A has potted three in a row, B two
  const onAStreak = () => play(newGame('A', 'B', 'C'), 'Ap Bp Cx Ap Bp Cx Ap');

  it('should hand the host\'s card the current player\'s streak', async () => {
    setUp(turnOf(onAStreak(), 'A'));
    render(<GamePage />);

    expect(await screen.findByTestId('swipe-card')).toHaveTextContent('A, streak 3');
  });

  it('should show a spectator the current player on fire', async () => {
    setUp(turnOf(onAStreak(), 'A'), { isSpectatorMode: true });
    render(<GamePage />);

    expect(await screen.findByRole('img', { name: 'On fire: 3 pots in a row' })).toBeInTheDocument();
  });

  it('should show every streak in the players list', async () => {
    setUp(turnOf(onAStreak(), 'B'));
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'View all players' }));

    expect(screen.getByRole('img', { name: 'On fire: 3 pots in a row' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Streak: 2 pots in a row' })).toBeInTheDocument();
  });

  it('should take the streak back with an undone shot', async () => {
    const undone = undoLastAction(onAStreak());
    setUp(undone);
    render(<GamePage />);

    // Undo hands the turn back to A, now on two in a row
    expect(await screen.findByTestId('swipe-card')).toHaveTextContent('A, streak 2');
  });
});

describe('awards on the winner screen', () => {
  /** A pots six (four in a row) and wins, B pots two blacks, C goes out first */
  const showcase = () =>
    play(newGame('A', 'B', 'C'), 'Ap Bb Cx Ap Bb Cx Ap Bx Cx Ap Bx Ax Bx Ap Bx Ap Bx');

  it.each([
    ['the host', {}],
    ['a spectator', { isSpectatorMode: true }],
  ])('should show %s the awards and the match stats', async (_who, overrides) => {
    setUp(showcase(), overrides);
    render(<GamePage />);

    await screen.findByText(/a wins!/i);
    const awards = within(screen.getByRole('region', { name: 'Awards' })).getAllByRole('listitem');
    expect(awards.map((a) => a.querySelector('p')?.textContent)).toEqual([
      'MVP',
      'Hot Streak',
      'Black Ball Master',
      'Sniper',
      'First Out',
    ]);
    expect(within(screen.getByRole('region', { name: 'Match stats' })).getAllByRole('row')).toHaveLength(4);
  });
});
