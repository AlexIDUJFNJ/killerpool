/**
 * Tests for the sound settings and their hook
 */

import { renderHook, act } from '@testing-library/react';
import { useAudioSettings } from '@/hooks/use-audio-settings';

type SettingsModule = typeof import('../audio-settings');

/** The in-memory fallback is module state, so each case gets a fresh copy */
async function loadSettings(): Promise<SettingsModule> {
  let mod: SettingsModule;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../audio-settings');
  });
  return mod!;
}

const KEY = 'killerpool-audio';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reading', () => {
  it('should have both effects and the voice on by default', async () => {
    const { readAudioSettings } = await loadSettings();
    expect(readAudioSettings()).toEqual({ sound: true, voice: true });
  });

  it('should fall back to the defaults for anything unreadable', async () => {
    const { readAudioSettings } = await loadSettings();

    localStorage.setItem(KEY, 'not json');
    expect(readAudioSettings()).toEqual({ sound: true, voice: true });

    localStorage.setItem(KEY, JSON.stringify({ sound: false, voice: 'yes' }));
    expect(readAudioSettings()).toEqual({ sound: false, voice: true });

    localStorage.setItem(KEY, 'null');
    expect(readAudioSettings()).toEqual({ sound: true, voice: true });
  });

  it('should hand back the same object while nothing changes', async () => {
    // useSyncExternalStore re-renders forever on a fresh object per read
    const { readAudioSettings, setAudioSetting } = await loadSettings();
    setAudioSetting('voice', false);

    expect(readAudioSettings()).toBe(readAudioSettings());
  });
});

describe('writing', () => {
  it('should keep each switch on its own', async () => {
    const { readAudioSettings, setAudioSetting } = await loadSettings();

    setAudioSetting('sound', false);
    expect(readAudioSettings()).toEqual({ sound: false, voice: true });

    setAudioSetting('voice', false);
    setAudioSetting('sound', true);
    expect(readAudioSettings()).toEqual({ sound: true, voice: false });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ sound: true, voice: false });
  });

  it('should survive a fresh load of the module, as after a reload', async () => {
    (await loadSettings()).setAudioSetting('voice', false);
    const { readAudioSettings } = await loadSettings();

    expect(readAudioSettings()).toEqual({ sound: true, voice: false });
  });

  it('should keep a choice for the visit when storage is blocked', async () => {
    const { readAudioSettings, setAudioSetting } = await loadSettings();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => setAudioSetting('sound', false)).not.toThrow();
    expect(readAudioSettings()).toEqual({ sound: false, voice: true });
  });

  it('should keep a choice for the visit when storage is full', async () => {
    const { readAudioSettings, setAudioSetting } = await loadSettings();
    setAudioSetting('sound', false);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    // The stored value is the old one; the choice just made still wins
    setAudioSetting('voice', false);

    expect(readAudioSettings()).toEqual({ sound: false, voice: false });
  });
});

describe('subscribing', () => {
  it('should hear changes from this tab and from another', async () => {
    const { subscribeToAudioSettings, setAudioSetting } = await loadSettings();
    const onChange = jest.fn();
    const unsubscribe = subscribeToAudioSettings(onChange);

    setAudioSetting('sound', false);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'killerpool-theme' }));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    setAudioSetting('sound', true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('useAudioSettings', () => {
  it('should follow the switches', async () => {
    const { setAudioSetting } = await import('../audio-settings');
    const { result } = renderHook(() => useAudioSettings());
    expect(result.current).toEqual({ sound: true, voice: true });

    act(() => setAudioSetting('voice', false));
    expect(result.current).toEqual({ sound: true, voice: false });

    act(() => setAudioSetting('voice', true));
  });
});
