/**
 * Tests for the commentator's banner, the final-duel overlay and the duel strip
 */

import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import { CommentaryBanner, DuelOverlay } from '../commentary-layer';
import { FinalDuelStrip } from '../final-duel-strip';
import { CommentaryQueue, LINE_MS, DUEL_MS } from '@/lib/commentary-queue';
import { createGame, applyAction } from '@/lib/game-logic';
import { Game, GameAction } from '@/lib/types';

// Plain elements instead of animated ones, and no exit animations to wait for:
// what is tested here is what shows when, which the queue decides
jest.mock('motion/react', () => {
  const ReactActual = jest.requireActual('react');
  const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition'];
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

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CommentaryBanner', () => {
  it('should announce lines politely from a region that is always there', () => {
    const queue = new CommentaryQueue();
    const { container } = render(<CommentaryBanner queue={queue} />);
    const region = container.querySelector('[aria-live]');

    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    act(() => queue.say('last_life', 'Anna is hanging by a thread.'));
    expect(region).toHaveTextContent('Anna is hanging by a thread.');
  });

  it('should never catch a tap meant for the game', () => {
    const queue = new CommentaryQueue();
    const { container } = render(<CommentaryBanner queue={queue} className="absolute top-full" />);

    expect(container.firstChild).toHaveClass('pointer-events-none', 'absolute', 'top-full');
  });

  it('should show the lines one at a time, each for its time', () => {
    const queue = new CommentaryQueue();
    render(<CommentaryBanner queue={queue} />);

    act(() => {
      queue.say('eliminated', 'Boris is out!');
      queue.say('final_duel', 'Pistols at dawn.');
    });
    expect(screen.getByText('Boris is out!')).toBeInTheDocument();
    expect(screen.queryByText('Pistols at dawn.')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(LINE_MS);
    });
    expect(screen.queryByText('Boris is out!')).not.toBeInTheDocument();
    expect(screen.getByText('Pistols at dawn.')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(LINE_MS);
    });
    expect(screen.queryByText('Pistols at dawn.')).not.toBeInTheDocument();
  });
});

describe('DuelOverlay', () => {
  it('should show both duellists and their lives, then go', () => {
    const queue = new CommentaryQueue();
    render(<DuelOverlay queue={queue} />);
    expect(screen.queryByTestId('final-duel-overlay')).not.toBeInTheDocument();

    act(() =>
      queue.showDuel([
        { id: 'a', name: 'Anna', avatar: '🎱', lives: 1 },
        { id: 'b', name: 'Boris', avatar: '🎯', lives: 4 },
      ])
    );

    const overlay = screen.getByTestId('final-duel-overlay');
    expect(overlay).toHaveTextContent('FINAL DUEL');
    expect(overlay).toHaveTextContent('Anna');
    expect(overlay).toHaveTextContent('1 life');
    expect(overlay).toHaveTextContent('Boris');
    expect(overlay).toHaveTextContent('4 lives');
    // Visual only: the commentator's line carries it to screen readers
    expect(overlay).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      jest.advanceTimersByTime(DUEL_MS);
    });
    expect(screen.queryByTestId('final-duel-overlay')).not.toBeInTheDocument();
  });

  it('should leave the flash out under "reduce motion"', () => {
    const queue = new CommentaryQueue();
    render(<DuelOverlay queue={queue} />);
    act(() => queue.showDuel([
      { id: 'a', name: 'Anna', avatar: '🎱', lives: 2 },
      { id: 'b', name: 'Boris', avatar: '🎯', lives: 2 },
    ]));

    expect(document.querySelector('.bg-red-600')).toHaveClass('motion-reduce:hidden');
  });

  it('should never block the screen it covers', () => {
    const queue = new CommentaryQueue();
    render(<DuelOverlay queue={queue} />);
    act(() => queue.showDuel([
      { id: 'a', name: 'Anna', avatar: '🎱', lives: 2 },
      { id: 'b', name: 'Boris', avatar: '🎯', lives: 2 },
    ]));

    expect(screen.getByTestId('final-duel-overlay')).toHaveClass('pointer-events-none');
  });
});

describe('FinalDuelStrip', () => {
  function shots(game: Game, playerIndex: number, ...actions: GameAction[]): Game {
    return actions.reduce((g, action) => applyAction({ ...g, currentPlayerIndex: playerIndex }, action), game);
  }

  const three = () => createGame([
    { name: 'Anna', avatar: '🎱' },
    { name: 'Boris', avatar: '🎯' },
    { name: 'Cleo', avatar: '⭐' },
  ]);

  it('should show the duel and the lives while it lasts', () => {
    const duel = shots(three(), 2, 'miss', 'miss', 'miss');
    render(<FinalDuelStrip game={shots(duel, 0, 'miss', 'miss')} />);

    expect(screen.getByText('Final duel')).toBeInTheDocument();
    expect(screen.getByText('Anna').parentElement).toHaveTextContent('1 life');
    expect(screen.getByText('Boris').parentElement).toHaveTextContent('3 lives');
  });

  it('should not show before the duel', () => {
    const { container } = render(<FinalDuelStrip game={shots(three(), 2, 'miss')} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should not show in a game that started with two', () => {
    const two = createGame([
      { name: 'Anna', avatar: '🎱' },
      { name: 'Boris', avatar: '🎯' },
    ]);
    const { container } = render(<FinalDuelStrip game={two} />);
    expect(container).toBeEmptyDOMElement();
  });
});
