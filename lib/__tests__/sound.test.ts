/**
 * Tests for the synthesised sound effects, against a stand-in AudioContext
 */

type SoundModule = typeof import('../sound');

interface Scheduled {
  kind: 'oscillator' | 'buffer';
  start: number;
  stop: number;
}

class FakeParam {
  value = 0;
  setValueAtTime = jest.fn();
  linearRampToValueAtTime = jest.fn();
  exponentialRampToValueAtTime = jest.fn();
}

class FakeNode {
  connect = jest.fn();
  disconnect = jest.fn();
}

/** Records what a sound schedules; jsdom has no Web Audio of its own */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: AudioContextState = 'running';
  currentTime = 10;
  sampleRate = 8000;
  destination = new FakeNode();
  scheduled: Scheduled[] = [];
  resume = jest.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  private source(kind: Scheduled['kind']) {
    const entry: Scheduled = { kind, start: NaN, stop: NaN };
    this.scheduled.push(entry);
    return Object.assign(new FakeNode(), {
      type: 'sine',
      buffer: null as unknown,
      frequency: new FakeParam(),
      start: jest.fn((at = 0) => {
        entry.start = at;
      }),
      stop: jest.fn((at = 0) => {
        entry.stop = at;
      }),
    });
  }

  createOscillator = () => this.source('oscillator');
  createBufferSource = () => this.source('buffer');
  createGain = () => Object.assign(new FakeNode(), { gain: new FakeParam() });
  createBiquadFilter = () => Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() });
  createDynamicsCompressor = () => new FakeNode();
  createBuffer = (_channels: number, length: number) => ({
    length,
    getChannelData: () => new Float32Array(length),
  });
}

const EFFECTS = ['pot', 'miss', 'black', 'eliminated', 'duel', 'victory'] as const;

/** A fresh copy of the module: its context is module state */
async function loadSound(): Promise<SoundModule> {
  let mod: SoundModule | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../sound');
  });
  return mod!;
}

const w = window as unknown as Record<string, unknown>;

beforeEach(() => {
  FakeAudioContext.instances = [];
  w.AudioContext = FakeAudioContext;
  delete w.webkitAudioContext;
});

afterAll(() => {
  delete w.AudioContext;
});

describe('without Web Audio', () => {
  beforeEach(() => {
    delete w.AudioContext;
  });

  it('should say so and stay silent without throwing', async () => {
    const sound = await loadSound();

    expect(sound.isSoundSupported()).toBe(false);
    expect(() => {
      sound.unlockSound();
      EFFECTS.forEach(effect => sound.playSound(effect));
    }).not.toThrow();
  });

  it('should stay silent when the browser refuses a context', async () => {
    w.AudioContext = class {
      constructor() {
        throw new Error('too many contexts');
      }
    };
    const sound = await loadSound();

    expect(() => sound.playSound('pot')).not.toThrow();
  });

  it('should use the prefixed context of older Safari', async () => {
    w.webkitAudioContext = FakeAudioContext;
    const sound = await loadSound();

    sound.playSound('pot');

    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

describe('the audio context', () => {
  it('should not be created on import', async () => {
    await loadSound();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('should be created on the first gesture, and only once', async () => {
    const sound = await loadSound();

    sound.unlockSound();
    sound.unlockSound();
    sound.playSound('pot');

    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('should be resumed and primed with a silent sample on the first gesture', async () => {
    // iOS keeps a context silent until it is resumed and played from a gesture
    const OriginalContext = FakeAudioContext;
    w.AudioContext = class extends OriginalContext {
      state: AudioContextState = 'suspended';
    };
    const sound = await loadSound();

    sound.unlockSound();
    sound.unlockSound();
    const ctx = FakeAudioContext.instances[0];

    expect(ctx.resume).toHaveBeenCalledTimes(1);
    // One silent buffer, not one per gesture
    expect(ctx.scheduled.filter(s => s.kind === 'buffer')).toHaveLength(1);
  });

  it('should leave a running context alone on later gestures', async () => {
    const sound = await loadSound();
    sound.unlockSound();
    sound.unlockSound();

    expect(FakeAudioContext.instances[0].resume).not.toHaveBeenCalled();
  });
});

describe('effects', () => {
  it.each(EFFECTS)('should schedule %s from now on', async (effect) => {
    const sound = await loadSound();
    sound.playSound(effect);
    const ctx = FakeAudioContext.instances[0];

    expect(ctx.scheduled.length).toBeGreaterThan(0);
    ctx.scheduled.forEach(s => {
      expect(s.start).toBeGreaterThanOrEqual(ctx.currentTime);
      expect(s.stop).toBeGreaterThan(s.start);
    });
  });

  it.each([
    ['pot', 0.8],
    ['miss', 0.8],
    ['black', 1.6],
    ['eliminated', 1.6],
    ['duel', 1.6],
    ['victory', 2.6],
  ] as const)('should keep %s under %s s', async (effect, limit) => {
    // Heard on every shot of an evening: short, and the fanfare not much longer
    const sound = await loadSound();
    sound.playSound(effect);
    const ctx = FakeAudioContext.instances[0];
    const end = Math.max(...ctx.scheduled.map(s => s.stop));

    expect(end - ctx.currentTime).toBeLessThanOrEqual(limit);
  });

  it('should not throw when a node misbehaves', async () => {
    const sound = await loadSound();
    sound.unlockSound();
    FakeAudioContext.instances[0].createOscillator = () => {
      throw new Error('broken');
    };

    expect(() => sound.playSound('victory')).not.toThrow();
  });
});

describe('a suspended context', () => {
  function suspendedContext() {
    const OriginalContext = FakeAudioContext;
    let resolveResume: () => void = () => {};
    w.AudioContext = class extends OriginalContext {
      state: AudioContextState = 'suspended';
      resume = jest.fn(
        () =>
          new Promise<void>(resolve => {
            resolveResume = () => {
              this.state = 'running';
              resolve();
            };
          })
      );
    };
    return { resume: () => resolveResume() };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should play once it resumes straight away', async () => {
    const control = suspendedContext();
    const sound = await loadSound();

    sound.playSound('pot');
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.scheduled).toHaveLength(0);

    control.resume();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.scheduled.length).toBeGreaterThan(0);
  });

  it('should drop a sound whose context only resumes much later', async () => {
    // A spectator who never touched the page must not hear every shot so far
    // at once on their first tap
    const control = suspendedContext();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const sound = await loadSound();

    sound.playSound('pot');
    sound.playSound('miss');
    const ctx = FakeAudioContext.instances[0];

    now.mockReturnValue(60_000);
    control.resume();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.scheduled).toHaveLength(0);
  });
});
