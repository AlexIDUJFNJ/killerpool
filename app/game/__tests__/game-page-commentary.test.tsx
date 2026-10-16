/**
 * Tests for the game screen's sound and commentary: the header switch, the
 * commentator's line, the final duel, and the changes that must stay quiet
 */

import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import GamePage from '../[id]/page';
import { createGame, applyAction, undoLastAction } from '@/lib/game-logic';
import { DUEL_MS, LINE_MS } from '@/lib/commentary-queue';
import { playSound } from '@/lib/sound';
import { speak } from '@/lib/voice';
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

jest.mock('@/lib/sound', () => ({
  isSoundSupported: () => true,
  playSound: jest.fn(),
  unlockSound: jest.fn(),
}));

jest.mock('@/lib/voice', () => ({
  isVoiceSupported: () => true,
  speak: jest.fn(),
  stopVoice: jest.fn(),
  unlockVoice: jest.fn(),
}));

// Plain elements instead of animated ones, and no exit animations to wait for
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
jest.mock('@/components/game/black-ball-celebration', () => ({
  BlackBallCelebration: ({ show }: { show: boolean }) => (show ? <div>Black ball celebration</div> : null),
}));
jest.mock('@/components/game/swipeable-player-card', () => ({
  SwipeablePlayerCard: ({ name }: { name: string }) => <div>{name}</div>,
}));

function newGame(...names: string[]): Game {
  return createGame(names.map(name => ({ name, avatar: '🎱' })));
}

function shoot(game: Game, playerIndex: number, action: GameAction): Game {
  return applyAction({ ...game, currentPlayerIndex: playerIndex }, action);
}

function shots(game: Game, playerIndex: number, ...actions: GameAction[]): Game {
  return actions.reduce((g, action) => shoot(g, playerIndex, action), game);
}

function setUp(game: Game, overrides: Record<string, unknown> = {}) {
  mockParams = { id: game.id };
  mockContext = {
    game,
    isLoading: false,
    isSpectatorMode: false,
    isSharingEnabled: false,
    currentUserId: null,
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
}

/** What the provider holds next: the host's own move, or a spectator's realtime update */
function moveTo(game: Game, rerender: (ui: React.ReactElement) => void) {
  mockContext = { ...mockContext, game, resultSync: game.status === 'completed' ? 'saved' : null };
  rerender(<GamePage />);
}

/** The live region the commentator's line appears in */
function commentary(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[aria-live="polite"]');
  if (!region) throw new Error('no commentary region');
  return region;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the sound switch', () => {
  it('should sit in the header for the host and for a spectator', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'pot');
    setUp(game);
    const { rerender } = render(<GamePage />);
    expect(screen.getByRole('button', { name: /sound settings/i })).toBeInTheDocument();

    mockContext = { ...mockContext, isSpectatorMode: true };
    rerender(<GamePage />);
    expect(screen.getByRole('button', { name: /sound settings/i })).toBeInTheDocument();
  });
});

describe('the host', () => {
  it('should hear the shot and read the line it earned', () => {
    const game = shoot(newGame('Anna', 'Boris'), 0, 'miss');
    setUp(game);
    const { rerender } = render(<GamePage />);
    expect(commentary()).toBeEmptyDOMElement();

    moveTo(shoot(game, 0, 'miss'), rerender);

    expect(playSound).toHaveBeenCalledWith('miss');
    expect(commentary()).toHaveTextContent('Anna');
    expect(speak).toHaveBeenCalled();
  });

  it('should stay quiet when undoing the shot that knocked a player out', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo', 'Dan'), 3, 'miss', 'miss');
    const out = shoot(game, 3, 'miss');
    setUp(out);
    const { rerender } = render(<GamePage />);

    moveTo(undoLastAction(out), rerender);

    expect(playSound).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(commentary()).toBeEmptyDOMElement();
  });

  it('should call the win on the winner screen, which replaces the game screen on that shot', () => {
    const game = shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss');
    setUp(game);
    const { rerender } = render(<GamePage />);

    moveTo(shoot(game, 1, 'miss'), rerender);

    expect(screen.getByRole('heading', { name: /anna wins!/i })).toBeInTheDocument();
    expect(playSound).toHaveBeenCalledWith('victory');
    expect(commentary()).toHaveTextContent('Anna');
  });

  it('should not cheer again when the host reopens a game already won', () => {
    setUp(shots(newGame('Anna', 'Boris'), 1, 'miss', 'miss', 'miss'));
    render(<GamePage />);

    expect(playSound).not.toHaveBeenCalled();
    expect(commentary()).toBeEmptyDOMElement();
  });
});

describe('the final duel', () => {
  it('should put up the overlay, then the line, and keep a strip up until the end', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo'), 2, 'miss', 'miss');
    setUp(game);
    const { rerender } = render(<GamePage />);
    expect(screen.queryByText('Final duel')).not.toBeInTheDocument();

    const duel = shoot(game, 2, 'miss');
    moveTo(duel, rerender);

    expect(playSound).toHaveBeenCalledWith('duel');
    expect(screen.getByTestId('final-duel-overlay')).toHaveTextContent('FINAL DUEL');
    expect(commentary()).toBeEmptyDOMElement();

    act(() => {
      jest.advanceTimersByTime(DUEL_MS);
    });
    expect(screen.queryByTestId('final-duel-overlay')).not.toBeInTheDocument();
    expect(commentary()).toHaveTextContent(/Anna[\s\S]*Boris/);

    // The strip stays for the rest of the game, shot after shot
    act(() => {
      jest.advanceTimersByTime(LINE_MS);
    });
    moveTo(shoot(duel, 0, 'pot'), rerender);
    expect(screen.getByText('Final duel')).toBeInTheDocument();
  });
});

describe('a spectator', () => {
  it('should hear and see what the host does, from realtime updates', () => {
    const game = shots(newGame('Anna', 'Boris', 'Cleo', 'Dan'), 3, 'miss', 'miss');
    setUp(game, { isSpectatorMode: true });
    const { rerender } = render(<GamePage />);

    moveTo(shoot(game, 3, 'miss'), rerender);

    expect(playSound).toHaveBeenCalledWith('eliminated');
    expect(commentary()).toHaveTextContent('Dan');
  });

  it('should get nothing from opening a game mid-way, or from catching up after a reconnect', () => {
    const start = newGame('Anna', 'Boris', 'Cleo');
    const opened = shots(start, 0, 'pot', 'pot', 'pot');
    setUp(opened, { isSpectatorMode: true });
    const { rerender } = render(<GamePage />);

    // Several shots at once: the channel was down while they were played
    moveTo(shots(opened, 2, 'miss', 'miss', 'miss'), rerender);

    expect(playSound).not.toHaveBeenCalled();
    expect(commentary()).toBeEmptyDOMElement();
    expect(screen.queryByTestId('final-duel-overlay')).not.toBeInTheDocument();
    // The strip is read from the game, so it is there all the same
    expect(screen.getByText('Final duel')).toBeInTheDocument();
  });

  it('should keep the line about a black on the last life until the celebration is over', () => {
    const game = shots(newGame('Anna', 'Boris'), 0, 'miss', 'miss');
    setUp(game, { isSpectatorMode: true });
    const { rerender } = render(<GamePage />);

    moveTo(shoot(game, 0, 'pot_black'), rerender);

    expect(screen.getByText('Black ball celebration')).toBeInTheDocument();
    expect(playSound).toHaveBeenCalledWith('black');
    expect(commentary()).toBeEmptyDOMElement();
  });
});
