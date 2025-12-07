/**
 * Tests for ActionButtons component
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButtons } from '../action-buttons';

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, whileTap, animate, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('ActionButtons', () => {
  const mockOnAction = jest.fn();

  beforeEach(() => {
    mockOnAction.mockClear();
  });

  it('should render all three action buttons', () => {
    render(<ActionButtons onAction={mockOnAction} />);

    expect(screen.getByRole('button', { name: /miss/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pot.*no change/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pot black/i })).toBeInTheDocument();
  });

  it('should display action descriptions', () => {
    render(<ActionButtons onAction={mockOnAction} />);

    expect(screen.getByText(/-1 life/i)).toBeInTheDocument();
    expect(screen.getByText(/no change/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 life/i)).toBeInTheDocument();
  });

  describe('Button interactions', () => {
    it('should call onAction with "miss" when MISS button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} />);

      const missButton = screen.getByRole('button', { name: /miss/i });
      await user.click(missButton);

      expect(mockOnAction).toHaveBeenCalledWith('miss');
      expect(mockOnAction).toHaveBeenCalledTimes(1);
    });

    it('should call onAction with "pot" when POT button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} />);

      const potButton = screen.getByRole('button', { name: /pot.*no change/i });
      await user.click(potButton);

      expect(mockOnAction).toHaveBeenCalledWith('pot');
      expect(mockOnAction).toHaveBeenCalledTimes(1);
    });

    it('should call onAction with "pot_black" when POT BLACK button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} />);

      const potBlackButton = screen.getByRole('button', { name: /pot black/i });
      await user.click(potBlackButton);

      expect(mockOnAction).toHaveBeenCalledWith('pot_black');
      expect(mockOnAction).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple button clicks', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} />);

      await user.click(screen.getByRole('button', { name: /miss/i }));
      await user.click(screen.getByRole('button', { name: /pot.*no change/i }));
      await user.click(screen.getByRole('button', { name: /pot black/i }));

      expect(mockOnAction).toHaveBeenCalledTimes(3);
      expect(mockOnAction).toHaveBeenNthCalledWith(1, 'miss');
      expect(mockOnAction).toHaveBeenNthCalledWith(2, 'pot');
      expect(mockOnAction).toHaveBeenNthCalledWith(3, 'pot_black');
    });
  });

  describe('Disabled state', () => {
    it('should disable all buttons when disabled prop is true', () => {
      render(<ActionButtons onAction={mockOnAction} disabled />);

      expect(screen.getByRole('button', { name: /miss/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /pot.*no change/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /pot black/i })).toBeDisabled();
    });

    it('should not call onAction when buttons are disabled', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} disabled />);

      await user.click(screen.getByRole('button', { name: /miss/i }));
      await user.click(screen.getByRole('button', { name: /pot.*no change/i }));
      await user.click(screen.getByRole('button', { name: /pot black/i }));

      expect(mockOnAction).not.toHaveBeenCalled();
    });
  });

  describe('Variants', () => {
    it('should render larger buttons by default', () => {
      render(<ActionButtons onAction={mockOnAction} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('h-24');
      });
    });

    it('should render compact buttons when compact prop is true', () => {
      render(<ActionButtons onAction={mockOnAction} compact />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('h-16');
      });
    });
  });

  describe('Styling', () => {
    it('should apply correct variant colors', () => {
      render(<ActionButtons onAction={mockOnAction} />);

      const missButton = screen.getByRole('button', { name: /miss/i });
      const potButton = screen.getByRole('button', { name: /pot.*no change/i });
      const potBlackButton = screen.getByRole('button', { name: /pot black/i });

      expect(missButton).toHaveClass('bg-red-600');
      expect(potButton).toHaveClass('bg-slate-600');
      expect(potBlackButton).toHaveClass('bg-emerald-600');
    });

    it('should accept custom className', () => {
      render(<ActionButtons onAction={mockOnAction} className="custom-actions" />);

      const container = screen.getByRole('button', { name: /miss/i }).parentElement?.parentElement;
      expect(container).toHaveClass('custom-actions');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      render(<ActionButtons onAction={mockOnAction} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<ActionButtons onAction={mockOnAction} />);

      // Tab to first button and press Enter
      await user.tab();
      await user.keyboard('{Enter}');

      expect(mockOnAction).toHaveBeenCalled();
    });
  });
});
