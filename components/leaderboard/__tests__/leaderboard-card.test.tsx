/**
 * Tests for LeaderboardCard's avatar and rank
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardCard, LeaderboardEntry, getAvatarImageUrl, getInitials } from '../leaderboard-card';

function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    player_id: 'p1',
    display_name: 'Jane Doe',
    avatar_url: null,
    total_games: 10,
    games_won: 7,
    games_lost: 3,
    win_rate: 70,
    total_actions: 120,
    total_black_pots: 4,
    rank: 5,
    ...overrides,
  };
}

describe('getAvatarImageUrl', () => {
  it('should accept http(s) URLs', () => {
    expect(getAvatarImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(getAvatarImageUrl(' http://example.com/a.png ')).toBe('http://example.com/a.png');
  });

  it('should reject anything that is not a web image URL', () => {
    expect(getAvatarImageUrl(null)).toBeNull();
    expect(getAvatarImageUrl('')).toBeNull();
    expect(getAvatarImageUrl('🎱')).toBeNull();
    expect(getAvatarImageUrl('avatars/me.png')).toBeNull();
    expect(getAvatarImageUrl('javascript:alert(1)')).toBeNull();
    expect(getAvatarImageUrl('data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('getInitials', () => {
  it.each([
    ['Jane Doe', 'JD'],
    ['jane.doe', 'JD'],
    ['alex', 'A'],
    ['  mary  ann  smith ', 'MA'],
    ['élodie_roux', 'ÉR'],
    ['', '?'],
  ])('%p → %p', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });
});

describe('LeaderboardCard', () => {
  it('should show the picture when avatar_url is a URL', () => {
    const { container } = render(
      <LeaderboardCard entry={makeEntry({ avatar_url: 'https://cdn.example.com/jane.png' })} />
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/jane.png');
    expect(screen.queryByText('JD')).not.toBeInTheDocument();
  });

  it('should show initials instead of printing a missing avatar', () => {
    const { container } = render(<LeaderboardCard entry={makeEntry()} />);

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('should never print a non-URL avatar value as text', () => {
    render(<LeaderboardCard entry={makeEntry({ avatar_url: 'not a url' })} />);

    expect(screen.queryByText('not a url')).not.toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('should fall back to initials when the image fails to load', () => {
    const { container } = render(
      <LeaderboardCard entry={makeEntry({ avatar_url: 'https://cdn.example.com/missing.png' })} />
    );

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('should announce the rank, including for the trophy places', () => {
    const { rerender } = render(<LeaderboardCard entry={makeEntry({ rank: 5 })} />);
    expect(screen.getByText('Rank 5')).toBeInTheDocument();

    rerender(<LeaderboardCard entry={makeEntry({ rank: 1 })} />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
  });
});
