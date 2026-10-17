/**
 * Tests for StreakBadge, and the streak on the cards that show it
 */

import { render, screen, within } from '@testing-library/react';
import { StreakBadge, streakLabel } from '../streak-badge';
import { SwipeablePlayerCard } from '../swipeable-player-card';
import { PlayerCard } from '../player-card';

describe('StreakBadge', () => {
  it.each([0, 1])('should show nothing for %i pots in a row', (streak) => {
    const { container } = render(<StreakBadge streak={streak} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should show the count from two pots in a row', () => {
    render(<StreakBadge streak={2} />);

    const badge = screen.getByRole('img', { name: 'Streak: 2 pots in a row' });
    expect(badge).toHaveTextContent('🔥×2');
    expect(badge).not.toHaveTextContent(/on fire/i);
  });

  it('should say "On fire" from three', () => {
    render(<StreakBadge streak={3} />);

    const badge = screen.getByRole('img', { name: 'On fire: 3 pots in a row' });
    expect(badge).toHaveTextContent(/on fire/i);
    expect(badge).toHaveTextContent('×3');
  });

  it('should keep the small badge to the count, and the full name for screen readers', () => {
    render(<StreakBadge streak={5} size="sm" />);

    const badge = screen.getByRole('img', { name: 'On fire: 5 pots in a row' });
    expect(badge).toHaveTextContent('🔥×5');
  });

  it('should name the streak the same way everywhere', () => {
    expect(streakLabel(2)).toBe('Streak: 2 pots in a row');
    expect(streakLabel(4)).toBe('On fire: 4 pots in a row');
  });
});

describe('streak on the swipe card', () => {
  const props = { name: 'Alice', avatar: '🎯', lives: 3, maxLives: 6, onSwipe: jest.fn() };

  it('should show no badge and keep the plain card without a streak', () => {
    render(<SwipeablePlayerCard {...props} streak={1} />);

    const card = screen.getByRole('group', { name: 'Alice, 3 lives remaining' });
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    expect(card.innerHTML).not.toMatch(/animate-on-fire/);
  });

  it('should show the badge and say the streak in the card\'s name', () => {
    render(<SwipeablePlayerCard {...props} streak={2} />);

    const card = screen.getByRole('group', { name: 'Alice, 3 lives remaining, 2 pots in a row' });
    expect(within(card).getByRole('img', { name: 'Streak: 2 pots in a row' })).toBeInTheDocument();
    expect(card.innerHTML).not.toMatch(/animate-on-fire/);
  });

  it('should light the card up on fire, pulsing only where motion is welcome', () => {
    render(<SwipeablePlayerCard {...props} streak={3} />);

    const card = screen.getByRole('group', { name: /3 pots in a row/ });
    expect(within(card).getByRole('img', { name: 'On fire: 3 pots in a row' })).toBeInTheDocument();
    const highlighted = card.querySelector('[class*="animate-on-fire"]');
    expect(highlighted).toHaveClass('border-orange-500/60');
    // Never a bare animate-on-fire: with "reduce motion" the highlight stays still
    expect(highlighted!.className.split(' ')).toContain('motion-safe:animate-on-fire');
    expect(highlighted!.className.split(' ')).not.toContain('animate-on-fire');
  });
});

describe('streak on the player cards', () => {
  const props = { id: 'p1', name: 'Bob', avatar: '🎱', lives: 3 };

  it('should show the small badge in the players list', () => {
    render(<PlayerCard {...props} variant="compact" streak={4} />);

    const badge = screen.getByRole('img', { name: 'On fire: 4 pots in a row' });
    expect(badge).toHaveTextContent('🔥×4');
  });

  it('should show no streak for a player who is out', () => {
    render(<PlayerCard {...props} variant="compact" lives={0} eliminated streak={3} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should light up the spectator\'s card of a player on fire', () => {
    const { container } = render(<PlayerCard {...props} isActive streak={3} />);

    expect(screen.getByRole('img', { name: 'On fire: 3 pots in a row' })).toHaveTextContent(/on fire/i);
    expect(container.querySelector('.border-orange-500\\/60')).toHaveClass('motion-safe:animate-on-fire');
  });

  it('should leave the card plain on a streak of two', () => {
    const { container } = render(<PlayerCard {...props} isActive streak={2} />);

    expect(screen.getByRole('img', { name: 'Streak: 2 pots in a row' })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/animate-on-fire/);
  });
});
