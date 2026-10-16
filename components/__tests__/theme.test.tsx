/**
 * Tests for the theme preference: the inline head script and the switcher
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
} from '../theme';
import { ThemeToggle } from '../theme-toggle';

const originalMatchMedia = window.matchMedia;
let systemDark = false;
let systemListeners: Array<() => void> = [];

function mockSystemTheme(dark: boolean) {
  systemDark = dark;
  systemListeners = [];
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' && systemDark;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => systemListeners.push(listener),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
}

function runHeadScript() {
  new Function(THEME_SCRIPT)();
}

const isDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
  mockSystemTheme(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

describe('THEME_SCRIPT', () => {
  it('should default to dark when nothing is stored', () => {
    runHeadScript();

    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('should ignore an unknown stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    runHeadScript();

    expect(isDark()).toBe(true);
  });

  it.each<[ThemePreference, boolean, boolean]>([
    ['light', false, false],
    ['light', true, false],
    ['dark', false, true],
    ['dark', true, true],
    ['system', false, false],
    ['system', true, true],
  ])('should agree with applyTheme for %s (system dark: %s)', (preference, system, expected) => {
    mockSystemTheme(system);
    localStorage.setItem(THEME_STORAGE_KEY, preference);

    runHeadScript();
    const fromScript = isDark();
    document.documentElement.className = '';
    applyTheme(preference);

    expect(fromScript).toBe(expected);
    expect(isDark()).toBe(expected);
    expect(resolveTheme(preference, system)).toBe(expected ? 'dark' : 'light');
  });

  it('should follow a system change while "system" is chosen', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    runHeadScript();
    expect(isDark()).toBe(false);

    systemDark = true;
    systemListeners.forEach((listener) => listener());

    expect(isDark()).toBe(true);
  });

  it('should ignore a system change when a fixed theme is chosen', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runHeadScript();

    systemDark = true;
    systemListeners.forEach((listener) => listener());

    expect(isDark()).toBe(false);
  });

  it('should pick up a choice made in another tab', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runHeadScript();

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));

    expect(isDark()).toBe(false);
  });
});

describe('ThemeToggle', () => {
  it('should offer light, dark and system and press the stored one', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    render(<ThemeToggle />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should press Dark when nothing is stored', () => {
    render(<ThemeToggle />);

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should store and apply a new choice', async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Light' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemePreference()).toBe('light');
    expect(isDark()).toBe(false);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should resolve "system" against the device setting', async () => {
    const user = userEvent.setup();
    mockSystemTheme(true);
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(isDark()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'System' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(isDark()).toBe(true);
  });

  it('should keep every toggle on the page in step', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>
    );

    await user.click(screen.getAllByRole('button', { name: 'Light' })[0]);

    for (const button of screen.getAllByRole('button', { name: 'Light' })) {
      expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
