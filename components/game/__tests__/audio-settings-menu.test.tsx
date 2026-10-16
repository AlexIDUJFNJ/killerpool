/**
 * Tests for the sound switch in the game screen's header
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { AudioSettingsMenu } from '../audio-settings-menu';
import { playSound, unlockSound } from '@/lib/sound';
import { speak, stopVoice, unlockVoice } from '@/lib/voice';

jest.mock('@/lib/sound', () => ({
  isSoundSupported: jest.fn(() => true),
  playSound: jest.fn(),
  unlockSound: jest.fn(),
}));

jest.mock('@/lib/voice', () => ({
  isVoiceSupported: jest.fn(() => true),
  speak: jest.fn(),
  stopVoice: jest.fn(),
  unlockVoice: jest.fn(),
}));

const stored = () => JSON.parse(localStorage.getItem('killerpool-audio') ?? 'null');

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /sound settings/i }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AudioSettingsMenu', () => {
  it('should say on the button what is on', () => {
    render(<AudioSettingsMenu />);

    const button = screen.getByRole('button', { name: 'Sound settings: effects on, commentator on' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('should offer both switches, on by default', () => {
    render(<AudioSettingsMenu />);
    openMenu();

    expect(screen.getByRole('switch', { name: 'Sound effects' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Commentator voice' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /sound settings/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('should put a keyboard user on the first switch', () => {
    render(<AudioSettingsMenu />);
    openMenu();

    expect(screen.getByRole('switch', { name: 'Sound effects' })).toHaveFocus();
  });

  it('should switch the effects off and keep that on this device', () => {
    render(<AudioSettingsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole('switch', { name: 'Sound effects' }));

    expect(screen.getByRole('switch', { name: 'Sound effects' })).toHaveAttribute('aria-checked', 'false');
    expect(stored()).toEqual({ sound: false, voice: true });
    expect(screen.getByRole('button', { name: 'Sound settings: effects off, commentator on' })).toBeInTheDocument();
    expect(playSound).not.toHaveBeenCalled();
  });

  it('should play a sample when the effects come back on', () => {
    // The click is a gesture: the right moment to unlock audio on iOS
    localStorage.setItem('killerpool-audio', JSON.stringify({ sound: false, voice: true }));
    render(<AudioSettingsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole('switch', { name: 'Sound effects' }));

    expect(unlockSound).toHaveBeenCalled();
    expect(playSound).toHaveBeenCalledWith('pot');
  });

  it('should silence the commentator at once when the voice goes off', () => {
    render(<AudioSettingsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole('switch', { name: 'Commentator voice' }));

    expect(stopVoice).toHaveBeenCalled();
    expect(stored()).toEqual({ sound: true, voice: false });
  });

  it('should let the commentator say hello when the voice comes back on', () => {
    localStorage.setItem('killerpool-audio', JSON.stringify({ sound: true, voice: false }));
    render(<AudioSettingsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole('switch', { name: 'Commentator voice' }));

    expect(unlockVoice).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith(expect.stringMatching(/commentator/i));
  });

  it('should show everything off on the button when both are off', () => {
    localStorage.setItem('killerpool-audio', JSON.stringify({ sound: false, voice: false }));
    render(<AudioSettingsMenu />);

    expect(screen.getByRole('button', { name: 'Sound settings: effects off, commentator off' })).toBeInTheDocument();
  });

  it('should close on Escape and hand focus back to the button', () => {
    render(<AudioSettingsMenu />);
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sound settings/i })).toHaveFocus();
  });

  it('should close on a tap elsewhere, and stay open on a tap inside', () => {
    render(
      <div>
        <AudioSettingsMenu />
        <p>Elsewhere</p>
      </div>
    );
    openMenu();

    fireEvent.pointerDown(screen.getByRole('switch', { name: 'Sound effects' }));
    expect(screen.getByRole('switch', { name: 'Sound effects' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('should say when this browser cannot speak', () => {
    const { isVoiceSupported } = jest.requireMock('@/lib/voice');
    isVoiceSupported.mockReturnValueOnce(false);
    render(<AudioSettingsMenu />);
    openMenu();

    expect(screen.getByRole('switch', { name: 'Commentator voice' })).toHaveAccessibleDescription(
      'Not supported in this browser'
    );
  });
});
