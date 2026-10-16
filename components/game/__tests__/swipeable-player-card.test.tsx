/**
 * Tests for SwipeablePlayerCard's non-swipe controls: buttons and keyboard
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwipeablePlayerCard } from '../swipeable-player-card';

const defaultProps = {
  name: 'Alice',
  avatar: '🎯',
  lives: 3,
  maxLives: 6,
};

describe('SwipeablePlayerCard', () => {
  describe('action buttons', () => {
    it.each([
      ['Miss', 'miss'],
      ['Pot', 'pot'],
      ['Black', 'pot_black'],
    ])('should call onSwipe with %s', async (label, action) => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} />);

      await user.click(screen.getByRole('button', { name: label }));

      expect(onSwipe).toHaveBeenCalledTimes(1);
      expect(onSwipe).toHaveBeenCalledWith(action);
    });

    it('should lay the buttons out in swipe-direction order: left, up, right', () => {
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={jest.fn()} />);

      const names = screen.getAllByRole('button').map((b) => b.textContent?.replace(/[←↑→\s]/g, ''));
      expect(names).toEqual(['Miss', 'Black', 'Pot']);
    });

    it('should advertise the matching arrow key', () => {
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'Miss' })).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft');
      expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-keyshortcuts', 'ArrowUp');
      expect(screen.getByRole('button', { name: 'Pot' })).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
    });

    it('should be disabled when the card is disabled', async () => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} disabled />);

      const miss = screen.getByRole('button', { name: 'Miss' });
      expect(miss).toBeDisabled();
      await user.click(miss);

      expect(onSwipe).not.toHaveBeenCalled();
    });
  });

  describe('keyboard', () => {
    it('should make the card focusable and describe it', () => {
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={jest.fn()} />);

      const card = screen.getByRole('group', { name: 'Alice, 3 lives remaining' });
      expect(card).toHaveAttribute('tabindex', '0');
      expect(card).toHaveAccessibleDescription(/arrow keys/i);
    });

    it.each([
      ['{ArrowLeft}', 'miss'],
      ['{ArrowRight}', 'pot'],
      ['{ArrowUp}', 'pot_black'],
    ])('should play %s on the focused card', async (key, action) => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} />);

      screen.getByRole('group', { name: /alice/i }).focus();
      await user.keyboard(key);

      expect(onSwipe).toHaveBeenCalledWith(action);
    });

    it('should also take arrow keys while an action button has focus', async () => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} />);

      screen.getByRole('button', { name: 'Pot' }).focus();
      await user.keyboard('{ArrowLeft}');

      expect(onSwipe).toHaveBeenCalledWith('miss');
    });

    it('should ignore other keys and modified arrows', async () => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} />);

      screen.getByRole('group', { name: /alice/i }).focus();
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
      await user.keyboard('a');

      expect(onSwipe).not.toHaveBeenCalled();
    });

    it('should ignore arrow keys when disabled', async () => {
      const onSwipe = jest.fn();
      const user = userEvent.setup();
      render(<SwipeablePlayerCard {...defaultProps} onSwipe={onSwipe} disabled />);

      const card = screen.getByRole('group', { name: /alice/i });
      // Out of the tab order, but still focusable from script
      expect(card).toHaveAttribute('tabindex', '-1');
      card.focus();
      expect(card).toHaveFocus();
      await user.keyboard('{ArrowLeft}');

      expect(onSwipe).not.toHaveBeenCalled();
    });

    it('should hand focus to the same control on the next player card', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SwipeablePlayerCard key="alice" {...defaultProps} onSwipe={jest.fn()} />
      );

      await user.click(screen.getByRole('button', { name: 'Black' }));
      // The game screen swaps in a fresh card for the next player
      rerender(<SwipeablePlayerCard key="bob" {...defaultProps} name="Bob" onSwipe={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'Black' })).toHaveFocus();
      expect(screen.getByRole('group', { name: /bob/i })).toBeInTheDocument();
    });
  });

  it('should say "life" for a single life', () => {
    render(<SwipeablePlayerCard {...defaultProps} lives={1} onSwipe={jest.fn()} />);

    expect(screen.getByRole('group', { name: 'Alice, 1 life remaining' })).toBeInTheDocument();
  });
});
