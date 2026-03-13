/**
 * Tests for Card components
 */

import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../card';

describe('Card Components', () => {
  describe('Card', () => {
    it('should render card with content', () => {
      render(<Card data-testid="card">Card Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Card Content');
    });

    it('should apply base classes', () => {
      render(<Card data-testid="card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-xl', 'border', 'bg-card', 'shadow-sm');
    });

    it('should accept custom className', () => {
      render(<Card className="custom-card" data-testid="card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('custom-card');
    });

    it('should forward ref correctly', () => {
      const ref = jest.fn();

      render(<Card ref={ref}>Content</Card>);

      expect(ref).toHaveBeenCalled();
    });
  });

  describe('CardHeader', () => {
    it('should render card header', () => {
      render(<CardHeader data-testid="header">Header Content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header Content');
    });

    it('should apply base classes', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-6');
    });
  });

  describe('CardTitle', () => {
    it('should render card title', () => {
      render(<CardTitle>Card Title</CardTitle>);

      expect(screen.getByText(/card title/i)).toBeInTheDocument();
    });

    it('should render as h3 element', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);

      const title = screen.getByTestId('title');
      expect(title.tagName).toBe('H3');
    });

    it('should apply base classes', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);

      const title = screen.getByTestId('title');
      expect(title).toHaveClass('font-semibold', 'leading-none', 'tracking-tight');
    });
  });

  describe('CardDescription', () => {
    it('should render card description', () => {
      render(<CardDescription>Card description text</CardDescription>);

      expect(screen.getByText(/card description text/i)).toBeInTheDocument();
    });

    it('should render as p element', () => {
      render(<CardDescription data-testid="description">Description</CardDescription>);

      const description = screen.getByTestId('description');
      expect(description.tagName).toBe('P');
    });

    it('should apply base classes', () => {
      render(<CardDescription data-testid="description">Text</CardDescription>);

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-sm', 'text-muted-foreground');
    });
  });

  describe('CardContent', () => {
    it('should render card content', () => {
      render(<CardContent data-testid="content">Main content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('Main content');
    });

    it('should apply base classes', () => {
      render(<CardContent data-testid="content">Content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-6', 'pt-0');
    });
  });

  describe('CardFooter', () => {
    it('should render card footer', () => {
      render(<CardFooter data-testid="footer">Footer content</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveTextContent('Footer content');
    });

    it('should apply base classes', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex', 'items-center', 'p-6', 'pt-0');
    });
  });

  describe('Card composition', () => {
    it('should render complete card with all components', () => {
      render(
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Player Stats</CardTitle>
            <CardDescription>Your performance this week</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Games played: 10</p>
            <p>Games won: 7</p>
          </CardContent>
          <CardFooter>
            <button>View Details</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByText(/player stats/i)).toBeInTheDocument();
      expect(screen.getByText(/your performance this week/i)).toBeInTheDocument();
      expect(screen.getByText(/games played: 10/i)).toBeInTheDocument();
      expect(screen.getByText(/games won: 7/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    });
  });
});
