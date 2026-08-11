/**
 * Tests for the install-prompt store
 */

type PwaInstallModule = typeof import('../pwa-install');

/** The store keeps module-level state, so each case needs a fresh copy */
async function loadStore(): Promise<PwaInstallModule> {
  let mod: PwaInstallModule;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../pwa-install');
  });
  return mod!;
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value,
    configurable: true,
  });
}

function setDisplayMode({ standalone }: { standalone: boolean }) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
    onchange: null,
  }));
}

/** Stand-in for the real event, which jsdom does not implement */
function makeInstallPromptEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: jest.Mock;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  return event;
}

describe('pwa-install store', () => {
  beforeEach(() => {
    setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120');
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
    setDisplayMode({ standalone: false });
  });

  it('should start out unavailable', async () => {
    const store = await loadStore();

    expect(store.getSnapshot()).toBe('unavailable');
  });

  it('should report the app as installed when running standalone', async () => {
    setDisplayMode({ standalone: true });
    const store = await loadStore();

    store.initInstallCapture();

    expect(store.getSnapshot()).toBe('installed');
  });

  it('should become available and suppress the browser prompt', async () => {
    const store = await loadStore();
    store.initInstallCapture();

    const event = makeInstallPromptEvent();
    const preventDefault = jest.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(store.getSnapshot()).toBe('available');
  });

  it('should notify subscribers when the state changes', async () => {
    const store = await loadStore();
    store.initInstallCapture();
    const listener = jest.fn();
    store.subscribe(listener);

    window.dispatchEvent(makeInstallPromptEvent());

    expect(listener).toHaveBeenCalled();
  });

  it('should show the prompt once and then report it as spent', async () => {
    const store = await loadStore();
    store.initInstallCapture();
    const event = makeInstallPromptEvent();
    window.dispatchEvent(event);

    expect(await store.promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // The saved event is single-use; a second call must not reuse it
    expect(await store.promptInstall()).toBe('unavailable');
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('should report unavailable when nothing was captured', async () => {
    const store = await loadStore();
    store.initInstallCapture();

    expect(await store.promptInstall()).toBe('unavailable');
  });

  it('should mark the app installed after the appinstalled event', async () => {
    const store = await loadStore();
    store.initInstallCapture();
    window.dispatchEvent(makeInstallPromptEvent());

    window.dispatchEvent(new Event('appinstalled'));

    expect(store.getSnapshot()).toBe('installed');
  });

  it('should fall back to manual instructions on iOS', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari');
    const store = await loadStore();

    store.initInstallCapture();

    // Safari has no beforeinstallprompt, so the UI has to explain the share sheet
    expect(store.getSnapshot()).toBe('ios');
  });

  it('should detect iPadOS, which claims to be a Mac', async () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari');
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    const store = await loadStore();

    store.initInstallCapture();

    expect(store.getSnapshot()).toBe('ios');
  });

  it('should render as unavailable on the server', async () => {
    const store = await loadStore();

    expect(store.getServerSnapshot()).toBe('unavailable');
  });
});
