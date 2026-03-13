/**
 * Tests for PlayerCard component
 */

import { render, screen } from '@testing-library/react';
import { PlayerCard } from '../player-card';

// Mock framer-motion to avoid animation issues in tests
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, initial, animate, transition, layoutId, whileTap, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('PlayerCard', () => {
  const defaultProps = {
    id: 'player-1',
    name: 'Test Player',
    avatar: '🎱',
    lives: 3,
  };

  it('should render player name', () => {
    render(<PlayerCard {...defaultProps} />);

    expect(screen.getByText(/test player/i)).toBeInTheDocument();
  });

  it('should render player avatar', () => {
    render(<PlayerCard {...defaultProps} />);

    expect(screen.getByText('🎱')).toBeInTheDocument();
  });

  it('should use default avatar when not provided', () => {
    render(<PlayerCard {...defaultProps} avatar={undefined} />);

    expect(screen.getByText('🎱')).toBeInTheDocument();
  });

  describe('Lives display', () => {
    it('should display correct number of lives', () => {
      const { container } = render(<PlayerCard {...defaultProps} lives={3} maxLives={3} />);

      // Check for life indicators (circles with bg-emerald-500)
      const lifeIndicators = container.querySelectorAll('.bg-emerald-500');
      expect(lifeIndicators.length).toBeGreaterThanOrEqual(3);
    });

    it('should show Lives label in default variant', () => {
      render(<PlayerCard {...defaultProps} />);

      expect(screen.getByText(/lives:/i)).toBeInTheDocument();
    });

    it('should show extra lives badge when lives exceed maxLives', () => {
      render(<PlayerCard {...defaultProps} lives={6} maxLives={3} />);

      expect(screen.getByText('+3')).toBeInTheDocument();
    });
  });

  describe('Active state', () => {
    it('should show Active badge when isActive is true', () => {
      render(<PlayerCard {...defaultProps} isActive />);

      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it('should not show Active badge when isActive is false', () => {
      render(<PlayerCard {...defaultProps} isActive={false} />);

      expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
    });

    it('should apply ring-3 style when active', () => {
      const { container } = render(<PlayerCard {...defaultProps} isActive />);

      const card = container.querySelector('.ring-2');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Eliminated state', () => {
    it('should show Out badge when eliminated is true', () => {
      render(<PlayerCard {...defaultProps} eliminated />);

      expect(screen.getByText(/out/i)).toBeInTheDocument();
    });

    it('should not show Out badge when eliminated is false', () => {
      render(<PlayerCard {...defaultProps} eliminated={false} />);

      expect(screen.queryByText(/out/i)).not.toBeInTheDocument();
    });

    it('should apply grayscale when eliminated', () => {
      const { container } = render(<PlayerCard {...defaultProps} eliminated />);

      const card = container.querySelector('.grayscale');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<PlayerCard {...defaultProps} variant="default" />);

      expect(screen.getByText(/lives:/i)).toBeInTheDocument();
      expect(screen.getByText(/test player/i)).toBeInTheDocument();
    });

    it('should render compact variant', () => {
      render(<PlayerCard {...defaultProps} variant="compact" />);

      expect(screen.getByText(/test player/i)).toBeInTheDocument();
    });

    it('should render mini variant', () => {
      render(<PlayerCard {...defaultProps} variant="mini" />);

      expect(screen.getByText(/test player/i)).toBeInTheDocument();
      expect(screen.getByText('→')).toBeInTheDocument();
    });

    it('should render inline variant', () => {
      render(<PlayerCard {...defaultProps} variant="inline" />);

      expect(screen.getByText(/test player's turn/i)).toBeInTheDocument();
    });

    it('should show position number in compact variant when provided', () => {
      render(<PlayerCard {...defaultProps} variant="compact" showPosition={1} />);

      expect(screen.getByText('1.')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should accept custom className', () => {
      const { container } = render(<PlayerCard {...defaultProps} className="custom-player-card" />);

      expect(container.firstChild).toHaveClass('custom-player-card');
    });

    it('should apply transition classes', () => {
      const { container } = render(<PlayerCard {...defaultProps} />);

      const card = container.querySelector('.transition-all');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero lives', () => {
      const { container } = render(<PlayerCard {...defaultProps} lives={0} />);

      // Should not show any filled life indicators
      expect(container.querySelector('.bg-emerald-500.border-emerald-400')).not.toBeInTheDocument();
    });

    it('should handle many lives (>5) in mini/inline variants', () => {
      render(<PlayerCard {...defaultProps} lives={7} variant="mini" />);

      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('should handle long player names', () => {
      render(<PlayerCard {...defaultProps} name="Very Long Player Name That Should Be Truncated" />);

      const nameElement = screen.getByText(/very long player name/i);
      expect(nameElement).toHaveClass('truncate');
    });

    it('should render both Active and Out badges correctly when both props are true', () => {
      render(<PlayerCard {...defaultProps} isActive eliminated />);

      expect(screen.getByText(/active/i)).toBeInTheDocument();
      expect(screen.getByText(/out/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should render with proper semantic structure', () => {
      const { container } = render(<PlayerCard {...defaultProps} />);

      const heading = container.querySelector('h3');
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Test Player');
    });

    it('should handle apostrophe in inline variant', () => {
      render(<PlayerCard {...defaultProps} variant="inline" />);

      // Check that the apostrophe is properly escaped
      expect(screen.getByText(/test player's turn/i)).toBeInTheDocument();
    });
  });
});
