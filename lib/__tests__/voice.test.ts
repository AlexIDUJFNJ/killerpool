/**
 * Tests for the commentator's voice and its queue, against a stand-in
 * speechSynthesis
 */

type VoiceModule = typeof import('../voice');

async function loadVoice(): Promise<VoiceModule> {
  let mod: VoiceModule;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../voice');
  });
  return mod!;
}

class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function fakeVoice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

/** The browser's speech engine: remembers what it was asked to say */
function installSynth(voices: SpeechSynthesisVoice[] = []) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speak: jest.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
    }),
    cancel: jest.fn(),
    getVoices: jest.fn(() => voices),
    addEventListener: jest.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true, writable: true });
  return {
    synth,
    /** Lines actually handed to the engine, silent ones left out */
    said: () => spoken.filter(u => u.volume > 0).map(u => u.text),
    /** The engine finishes the line it is on */
    finish: () => {
      const last = spoken[spoken.length - 1];
      last?.onend?.();
    },
    last: () => spoken[spoken.length - 1],
  };
}

function removeSynth() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  removeSynth();
});

describe('without speechSynthesis', () => {
  it('should say so and stay quiet without throwing', async () => {
    removeSynth();
    const voice = await loadVoice();

    expect(voice.isVoiceSupported()).toBe(false);
    expect(() => {
      voice.unlockVoice();
      voice.speak('Anna is out!');
      voice.speak('Later', 500);
      jest.runAllTimers();
      voice.stopVoice();
    }).not.toThrow();
  });
});

describe('speaking', () => {
  it('should say a line straight away when nothing else is being said', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('Anna is out!');

    expect(engine.said()).toEqual(['Anna is out!']);
  });

  it('should not cut the line being spoken off', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('First');
    voice.speak('Second');

    expect(engine.said()).toEqual(['First']);
    expect(engine.synth.cancel).not.toHaveBeenCalled();

    engine.finish();
    expect(engine.said()).toEqual(['First', 'Second']);
  });

  it('should drop older lines that piled up, keeping the newest', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('First');
    voice.speak('Second');
    voice.speak('Third');
    voice.speak('Fourth');
    engine.finish();
    engine.finish();

    expect(engine.said()).toEqual(['First', 'Fourth']);
  });

  it('should move on when the engine never reports the end of a line', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('Stuck');
    voice.speak('Next');
    jest.advanceTimersByTime(15_000);

    expect(engine.said()).toEqual(['Stuck', 'Next']);
  });

  it('should move on after an error', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('Broken');
    voice.speak('Next');
    engine.last().onerror?.();

    expect(engine.said()).toEqual(['Broken', 'Next']);
  });

  it('should ignore an empty line', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('   ');

    expect(engine.synth.speak).not.toHaveBeenCalled();
  });
});

describe('a delayed line', () => {
  it('should wait for its delay', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('After the fanfare', 1000);
    jest.advanceTimersByTime(999);
    expect(engine.said()).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(engine.said()).toEqual(['After the fanfare']);
  });

  it('should be replaced by a newer line before it starts', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('Old', 1000);
    voice.speak('New', 300);
    jest.runAllTimers();

    expect(engine.said()).toEqual(['New']);
  });
});

describe('stopVoice', () => {
  it('should silence the line being spoken and forget the rest', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.speak('Speaking');
    voice.speak('Waiting');
    voice.speak('Scheduled', 500);
    voice.stopVoice();
    engine.finish();
    jest.runAllTimers();

    expect(engine.synth.cancel).toHaveBeenCalledTimes(1);
    expect(engine.said()).toEqual(['Speaking']);

    // ...and is ready for the next line at once
    voice.speak('Fresh');
    expect(engine.said()).toEqual(['Speaking', 'Fresh']);
  });

  it('should not cancel anything when nothing is being said', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.stopVoice();

    expect(engine.synth.cancel).not.toHaveBeenCalled();
  });
});

describe('the voice', () => {
  it('should speak English, preferring a British voice', async () => {
    const engine = installSynth([
      fakeVoice('Thomas', 'fr-FR'),
      fakeVoice('Samantha', 'en-US'),
      fakeVoice('Daniel', 'en-GB'),
    ]);
    const voice = await loadVoice();

    voice.speak('Pistols at dawn');

    expect(engine.last().voice?.name).toBe('Daniel');
    expect(engine.last().lang).toBe('en-GB');
  });

  it('should fall back to an English locale when no voice list is loaded yet', async () => {
    const engine = installSynth([]);
    const voice = await loadVoice();

    voice.speak('Pistols at dawn');

    expect(engine.last().voice).toBeNull();
    expect(engine.last().lang).toBe('en-GB');
  });

  it('should look for a voice again when the list changes', async () => {
    const voices: SpeechSynthesisVoice[] = [];
    const engine = installSynth(voices);
    const voice = await loadVoice();
    voice.speak('One');
    engine.finish();

    voices.push(fakeVoice('Karen', 'en-AU'));
    const [, onVoicesChanged] = engine.synth.addEventListener.mock.calls[0];
    onVoicesChanged();
    voice.speak('Two');

    expect(engine.last().voice?.name).toBe('Karen');
  });

  describe('pickEnglishVoice', () => {
    it('should never pick a novelty voice', async () => {
      const { pickEnglishVoice } = await loadVoice();
      const picked = pickEnglishVoice([fakeVoice('Bad News', 'en-GB'), fakeVoice('Fred', 'en-US')]);
      expect(picked?.name).toBe('Fred');
    });

    it('should take an offline voice over one that needs the network', async () => {
      const { pickEnglishVoice } = await loadVoice();
      const picked = pickEnglishVoice([
        fakeVoice('Google UK English Male', 'en-GB', false),
        fakeVoice('Daniel', 'en_GB', true),
      ]);
      expect(picked?.name).toBe('Daniel');
    });

    it('should return null without an English voice', async () => {
      const { pickEnglishVoice } = await loadVoice();
      expect(pickEnglishVoice([fakeVoice('Milena', 'ru-RU')])).toBeNull();
    });
  });
});

describe('unlockVoice', () => {
  it('should speak once, silently', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.unlockVoice();
    voice.unlockVoice();

    expect(engine.synth.speak).toHaveBeenCalledTimes(1);
    expect(engine.last().volume).toBe(0);
    expect(engine.said()).toEqual([]);
  });

  it('should not hold up the first real line', async () => {
    const engine = installSynth();
    const voice = await loadVoice();

    voice.unlockVoice();
    voice.speak('Anna is out!');

    expect(engine.said()).toEqual(['Anna is out!']);
  });
});
