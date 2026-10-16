/**
 * Tests for the host secret (supabase/migrations/00016_host_secret.sql)
 */

import {
  createHostSecret,
  getHostSecret,
  hashHostSecret,
  MAX_HOST_SECRETS,
} from '../host-secret';

const KEY = 'killerpool_host_secrets';

// The vector supabase/test/rls-policies.sql (section H) checks the policy's
// encode(sha256(convert_to(secret, 'UTF8')), 'hex') against
const SECRET = 'e6acbb288743b67ec54c1718729bba1b22a731427f59cda0251c7503d153ab98';
const SECRET_HASH = 'a2a39130ba3c12f39309c51c06ebb04b5dfaa7d5eeb8e998707222135563304c';

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createHostSecret', () => {
  it('should mint 32 random bytes as hex and keep them under the game id', () => {
    const secret = createHostSecret('game-1');

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(stored()).toEqual({ 'game-1': secret });
    expect(getHostSecret('game-1')).toBe(secret);
  });

  it('should mint a different secret for every game', () => {
    const a = createHostSecret('game-1');
    const b = createHostSecret('game-2');

    expect(a).not.toBe(b);
    expect(stored()).toEqual({ 'game-1': a, 'game-2': b });
  });

  it('should never replace the secret of a game that has one', () => {
    // The row keeps the hash it was created with; a new secret would lock
    // this device out of its own game
    const first = createHostSecret('game-1');
    expect(createHostSecret('game-1')).toBe(first);
    expect(getHostSecret('game-1')).toBe(first);
  });

  it('should keep only the newest secrets', () => {
    const ids = Array.from({ length: MAX_HOST_SECRETS + 5 }, (_, i) => `game-${i}`);
    const secrets = ids.map(id => createHostSecret(id));

    expect(Object.keys(stored())).toEqual(ids.slice(5));
    expect(getHostSecret('game-0')).toBeNull();
    expect(getHostSecret('game-4')).toBeNull();
    expect(getHostSecret('game-5')).toBe(secrets[5]);
    expect(getHostSecret(ids[ids.length - 1])).toBe(secrets[secrets.length - 1]);
  });

  it('should not let an old game coming back push out a newer one', () => {
    const ids = Array.from({ length: MAX_HOST_SECRETS }, (_, i) => `game-${i}`);
    ids.forEach(id => createHostSecret(id));

    // Restarting the oldest game neither mints nor reorders anything
    createHostSecret('game-0');
    expect(Object.keys(stored())).toEqual(ids);
  });

  it('should return null when the secret cannot be kept', () => {
    // A hash whose secret is gone after a reload would lock the host out;
    // no hash at all leaves the game as it was before 00016
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(createHostSecret('game-1')).toBeNull();
    expect(getHostSecret('game-1')).toBeNull();
  });

  it('should return null without a random source', () => {
    jest.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('not available');
    });

    expect(createHostSecret('game-1')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('should survive whatever else is stored under its key', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(KEY, 'not json');
    expect(getHostSecret('game-1')).toBeNull();
    const secret = createHostSecret('game-1');
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(stored()).toEqual({ 'game-1': secret });

    localStorage.setItem(KEY, JSON.stringify({ 'game-1': 'short', 'game-2': 42, 'game-3': SECRET }));
    expect(getHostSecret('game-1')).toBeNull();
    expect(getHostSecret('game-2')).toBeNull();
    expect(getHostSecret('game-3')).toBe(SECRET);

    localStorage.setItem(KEY, JSON.stringify([SECRET]));
    expect(getHostSecret('0')).toBeNull();
  });
});

describe('getHostSecret', () => {
  it('should know nothing about a game this device did not start', () => {
    createHostSecret('game-1');
    expect(getHostSecret('someone-elses-game')).toBeNull();
  });
});

describe('hashHostSecret', () => {
  it('should give what the policy computes', async () => {
    await expect(hashHostSecret(SECRET)).resolves.toBe(SECRET_HASH);
  });

  it('should hash a freshly minted secret to 64 hex characters', async () => {
    const secret = createHostSecret('game-1')!;
    const hash = await hashHostSecret(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(secret);
  });

  it('should give null outside a secure context, where crypto.subtle is missing', async () => {
    const subtle = Object.getOwnPropertyDescriptor(crypto, 'subtle');
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
    try {
      await expect(hashHostSecret(SECRET)).resolves.toBeNull();
    } finally {
      if (subtle) Object.defineProperty(crypto, 'subtle', subtle);
    }
  });

  it('should give null when the digest fails', async () => {
    jest.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('NotSupportedError'));
    await expect(hashHostSecret(SECRET)).resolves.toBeNull();
  });
});
