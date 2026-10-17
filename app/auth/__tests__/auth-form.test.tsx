/**
 * Tests for the sign-in screen
 */

import { render, screen } from '@testing-library/react';
import AuthPage from '../page';
import { AuthForm } from '../auth-form';
import { getAuthErrorMessage } from '../auth-errors';

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));

describe('getAuthErrorMessage', () => {
  it('should map known codes to a message', () => {
    expect(getAuthErrorMessage('link_expired')).toMatch(/expired/i);
    expect(getAuthErrorMessage('other_browser')).toMatch(/same browser/i);
  });

  it('should ignore unknown or missing codes', () => {
    expect(getAuthErrorMessage('Your account is locked, call us')).toBeNull();
    expect(getAuthErrorMessage('toString')).toBeNull();
    expect(getAuthErrorMessage(null)).toBeNull();
  });
});

describe('AuthPage', () => {
  it('should show why the last sign-in failed', async () => {
    render(await AuthPage({ searchParams: Promise.resolve({ error: 'link_expired' }) }));

    expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/i);
  });

  it('should show nothing for a clean visit', async () => {
    render(await AuthPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AuthForm', () => {
  it('should offer a single way back to the home screen', () => {
    render(<AuthForm initialError={null} />);

    const homeLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/');
    expect(homeLinks).toHaveLength(1);
    expect(homeLinks[0]).toHaveTextContent('Continue as Guest');
    expect(screen.queryByText(/back to home/i)).not.toBeInTheDocument();
  });

  it('should not render the unfinished Apple option', () => {
    render(<AuthForm initialError={null} />);

    expect(screen.queryByText(/apple/i)).not.toBeInTheDocument();
  });
});
