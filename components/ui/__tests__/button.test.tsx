/**
 * Tests for Button component
 */

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { Button } from '../button';

describe('Button', () => {
  it('should render button with text', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('should handle click events', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>);

    const button = screen.getByRole('button', { name: /disabled button/i });
    expect(button).toBeDisabled();
  });

  it('should not call onClick when disabled', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<Button disabled onClick={handleClick}>Disabled Button</Button>);

    const button = screen.getByRole('button', { name: /disabled button/i });
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  describe('variants', () => {
    it('should render default variant', () => {
      render(<Button variant="default">Default</Button>);

      const button = screen.getByRole('button', { name: /default/i });
      expect(button).toHaveClass('bg-primary');
    });

    it('should render destructive variant', () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button).toHaveClass('bg-destructive');
    });

    it('should render outline-solid variant', () => {
      render(<Button variant="outline">Outline</Button>);

      const button = screen.getByRole('button', { name: /outline/i });
      expect(button).toHaveClass('border');
    });

    it('should render secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole('button', { name: /secondary/i });
      expect(button).toHaveClass('bg-secondary');
    });

    it('should render ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole('button', { name: /ghost/i });
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should render link variant', () => {
      render(<Button variant="link">Link</Button>);

      const button = screen.getByRole('button', { name: /link/i });
      expect(button).toHaveClass('text-primary');
    });
  });

  describe('sizes', () => {
    it('should render default size', () => {
      render(<Button size="default">Default Size</Button>);

      const button = screen.getByRole('button', { name: /default size/i });
      expect(button).toHaveClass('h-9');
    });

    it('should render small size', () => {
      render(<Button size="sm">Small</Button>);

      const button = screen.getByRole('button', { name: /small/i });
      expect(button).toHaveClass('h-8');
    });

    it('should render large size', () => {
      render(<Button size="lg">Large</Button>);

      const button = screen.getByRole('button', { name: /large/i });
      expect(button).toHaveClass('h-10');
    });

    it('should render extra large size', () => {
      render(<Button size="xl">Extra Large</Button>);

      const button = screen.getByRole('button', { name: /extra large/i });
      expect(button).toHaveClass('h-14');
    });

    it('should render icon size', () => {
      render(<Button size="icon" aria-label="Icon button">X</Button>);

      const button = screen.getByRole('button', { name: /icon button/i });
      expect(button).toHaveClass('h-9', 'w-9');
    });
  });

  it('should accept custom className', () => {
    render(<Button className="custom-class">Custom</Button>);

    const button = screen.getByRole('button', { name: /custom/i });
    expect(button).toHaveClass('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = jest.fn();

    render(<Button ref={ref}>Ref Button</Button>);

    expect(ref).toHaveBeenCalled();
  });

  it('should support button type attribute', () => {
    render(<Button type="submit">Submit</Button>);

    const button = screen.getByRole('button', { name: /submit/i });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('should support aria-label', () => {
    render(<Button aria-label="Close dialog">X</Button>);

    const button = screen.getByRole('button', { name: /close dialog/i });
    expect(button).toHaveAttribute('aria-label', 'Close dialog');
  });

  describe('asChild', () => {
    it('should render the child element with button styles instead of a button', () => {
      render(
        <Button asChild variant="outline" size="lg">
          <Link href="/history">History</Link>
        </Button>
      );

      const link = screen.getByRole('link', { name: /history/i });
      expect(link).toHaveAttribute('href', '/history');
      expect(link).toHaveClass('border', 'h-10');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should not nest a button inside the link', () => {
      const { container } = render(
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
      );

      expect(container.querySelector('a button, button a')).toBeNull();
      expect(container.querySelectorAll('a')).toHaveLength(1);
    });

    it('should merge the child className after the button classes', () => {
      render(
        <Button asChild className="w-full">
          <Link href="/" className="custom-link">Home</Link>
        </Button>
      );

      const link = screen.getByRole('link', { name: /home/i });
      expect(link).toHaveClass('bg-primary', 'w-full', 'custom-link');
    });

    it('should pass aria-label through to the child', () => {
      render(
        <Button asChild size="icon" aria-label="Back to home">
          <Link href="/">←</Link>
        </Button>
      );

      expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument();
    });

    it('should run both the child and the slot click handlers', async () => {
      const onSlotClick = jest.fn();
      const onChildClick = jest.fn((e: React.MouseEvent) => e.preventDefault());
      const user = userEvent.setup();

      render(
        <Button asChild onClick={onSlotClick}>
          <Link href="/" onClick={onChildClick}>Home</Link>
        </Button>
      );

      await user.click(screen.getByRole('link', { name: /home/i }));

      expect(onChildClick).toHaveBeenCalledTimes(1);
      expect(onSlotClick).toHaveBeenCalledTimes(1);
    });

    it('should forward the ref to the child element', () => {
      const ref = React.createRef<HTMLButtonElement>();

      render(
        <Button asChild ref={ref}>
          <Link href="/">Home</Link>
        </Button>
      );

      expect(ref.current?.tagName).toBe('A');
    });
  });
});
