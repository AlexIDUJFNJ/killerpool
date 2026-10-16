/**
 * Tests for the profile page: loading the account and its profile
 */

import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ProfilePage from '../page';

const mockPush = jest.fn();
const mockGetUser = jest.fn();
const mockSingle = jest.fn();
const mockUpsert = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: () => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
      upsert: mockUpsert,
    }),
  }),
}));

jest.mock('@/components/achievements/achievements-list', () => ({
  AchievementsList: () => null,
}));

const USER = {
  id: '0a0a0a0a-0000-4000-8000-00000000000a',
  email: 'anna@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
});

describe('ProfilePage', () => {
  it('should show the stored display name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockSingle.mockResolvedValue({ data: { display_name: 'Anna K' } });

    render(<ProfilePage />);

    expect(await screen.findByDisplayValue('Anna K')).toBeInTheDocument();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('should create a profile named after the email when there is none', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockSingle.mockResolvedValue({ data: null });

    render(<ProfilePage />);

    expect(await screen.findByDisplayValue('anna')).toBeInTheDocument();
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: USER.id, display_name: 'anna' },
      { onConflict: 'user_id' }
    );
  });

  it('should send a guest to sign in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<ProfilePage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth'));
  });

  it('should say when the profile could not be loaded', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockSingle.mockRejectedValue(new Error('offline'));

    render(<ProfilePage />);

    expect(await screen.findByText('Failed to load profile')).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('should not touch the page once it has been left', async () => {
    let resolveUser!: (value: unknown) => void;
    mockGetUser.mockReturnValue(new Promise((resolve) => (resolveUser = resolve)));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<ProfilePage />);
    unmount();
    resolveUser({ data: { user: null } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockPush).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
