/**
 * Tests for the achievement toast queue
 */

import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AchievementToasts } from '../achievement-toast';

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));

describe('AchievementToasts', () => {
  it('should keep an empty live region mounted while the queue is empty', () => {
    render(<AchievementToasts achievements={[]} onDismiss={() => {}} />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('should announce the first queued achievement inside the live region', () => {
    render(<AchievementToasts achievements={['first_win', 'wins_10']} onDismiss={() => {}} />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Achievement Unlocked!');
    expect(region).toHaveTextContent('First Blood');
    expect(region).not.toHaveTextContent('Rising Star');
  });

  it('should dismiss when the toast is activated', async () => {
    const onDismiss = jest.fn();
    const user = userEvent.setup();
    render(<AchievementToasts achievements={['first_win']} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: /first blood/i }));

    expect(onDismiss).toHaveBeenCalled();
  });

  it('should dismiss on its own after a few seconds', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<AchievementToasts achievements={['first_win']} onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
