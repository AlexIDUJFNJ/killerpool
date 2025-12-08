/**
 * Tests for Badge component
 */

import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';

describe('Badge', () => {
  it('should render badge with text', () => {
    render(<Badge>New</Badge>);

    expect(screen.getByText(/new/i)).toBeInTheDocument();
  });

  describe('variants', () => {
    it('should render default variant', () => {
      render(<Badge variant="default">Default</Badge>);

      const badge = screen.getByText(/default/i);
      expect(badge).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should render secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);

      const badge = screen.getByText(/secondary/i);
      expect(badge).toHaveClass('bg-secondary', 'text-secondary-foreground');
    });

    it('should render destructive variant', () => {
      render(<Badge variant="destructive">Error</Badge>);

      const badge = screen.getByText(/error/i);
      expect(badge).toHaveClass('bg-destructive', 'text-destructive-foreground');
    });

    it('should render outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);

      const badge = screen.getByText(/outline/i);
      expect(badge).toHaveClass('text-foreground');
    });
  });

  it('should accept custom className', () => {
    render(<Badge className="custom-badge">Custom</Badge>);

    const badge = screen.getByText(/custom/i);
    expect(badge).toHaveClass('custom-badge');
  });

  it('should render children correctly', () => {
    render(
      <Badge>
        <span data-testid="icon">🔥</span>
        <span>Hot</span>
      </Badge>
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText(/hot/i)).toBeInTheDocument();
  });

  it('should apply base classes', () => {
    render(<Badge>Base</Badge>);

    const badge = screen.getByText(/base/i);
    expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-md', 'text-xs');
  });

  it('should support HTML attributes', () => {
    render(<Badge data-testid="test-badge" id="badge-1">Test</Badge>);

    const badge = screen.getByTestId('test-badge');
    expect(badge).toHaveAttribute('id', 'badge-1');
  });
});
