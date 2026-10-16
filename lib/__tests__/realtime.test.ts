/**
 * Tests for the spectator's realtime subscription
 */

import { subscribeToGame, unsubscribeFromGame } from '../realtime';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_RULESET } from '../types';

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

type Handler = (payload: { new: unknown }) => void;
type StatusCallback = (status: string, err?: Error) => void;

/**
 * Behaves like realtime-js 2.112 where it matters here: channel() returns the
 * channel it already has for a topic (RealtimeClient.channel), on() throws
 * once that channel has subscribed, and removeChannel only drops it from the
 * list once the leave has been acknowledged — i.e. later.
 */
class FakeChannel {
  handlers: Handler[] = [];
  statusCallback: StatusCallback | null = null;
  state: 'closed' | 'joined' | 'leaving' = 'closed';

  constructor(public topic: string) {}

  on(_type: string, _filter: unknown, handler: Handler) {
    if (this.state === 'joined') {
      throw new Error(`cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`);
    }
    this.handlers.push(handler);
    return this;
  }

  subscribe(callback: StatusCallback) {
    // Subscribing a channel that is on its way out does nothing
    if (this.state !== 'closed') return this;
    this.state = 'joined';
    this.statusCallback = callback;
    return this;
  }

  emit(row: unknown) {
    this.handlers.forEach(handler => handler({ new: row }));
  }
}

function fakeClient() {
  const channels: FakeChannel[] = [];
  const client = {
    channels,
    channel: jest.fn((name: string) => {
      const topic = `realtime:${name}`;
      const existing = channels.find(c => c.topic === topic);
      if (existing) return existing;
      const created = new FakeChannel(topic);
      channels.push(created);
      return created;
    }),
    // The leave is acknowledged asynchronously; until then the channel stays
    removeChannel: jest.fn(async (channel: FakeChannel) => {
      channel.state = 'leaving';
      return 'ok';
    }),
  };
  mockedCreateClient.mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  return client;
}

const row = {
  id: 'game-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:05:00.000Z',
  status: 'active',
  participants: [
    { id: 'p1', name: 'Anna', avatar: '🎱', lives: 0, eliminated: true },
    { id: 'p2', name: 'Boris', avatar: '🎯', lives: 2, eliminated: false },
  ],
  winner_id: null,
  ruleset_id: null,
  history: null,
  created_by: null,
  current_player_index: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('subscribeToGame', () => {
  it('should get a working channel when subscribing to the same game again', async () => {
    // StrictMode runs every effect twice, and a spectator can leave a game
    // and come back. With one topic per game the second subscription got the
    // first channel back: on() threw "after subscribe()" — swallowed — and
    // the spectator's screen silently stopped updating.
    const client = fakeClient();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const first = subscribeToGame('game-1', jest.fn());
    void unsubscribeFromGame(first);

    const onUpdate = jest.fn();
    const second = subscribeToGame('game-1', onUpdate);

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    (second as unknown as FakeChannel).emit(row);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(client.channels).toHaveLength(2);

    consoleErrorSpy.mockRestore();
  });

  it('should subscribe to the row of that game only', () => {
    const client = fakeClient();
    const on = jest.spyOn(FakeChannel.prototype, 'on');

    subscribeToGame('game-1', jest.fn());

    expect(client.channel.mock.calls[0][0]).toMatch(/^game:game-1:/);
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.game-1' },
      expect.any(Function)
    );

    on.mockRestore();
  });

  it('should map a row exactly like a plain select does', () => {
    fakeClient();
    const onUpdate = jest.fn();

    const channel = subscribeToGame('game-1', onUpdate) as unknown as FakeChannel;
    channel.emit(row);

    expect(onUpdate).toHaveBeenCalledWith({
      id: 'game-1',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: 'active',
      players: row.participants,
      // No stored index: falls back to the first player still in the game
      currentPlayerIndex: 1,
      winnerId: null,
      rulesetId: undefined,
      ruleset: DEFAULT_RULESET,
      history: [],
      createdBy: null,
    });
  });

  it('should report whether the channel is actually subscribed', () => {
    fakeClient();
    const onStatus = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const channel = subscribeToGame('game-1', jest.fn(), onStatus) as unknown as FakeChannel;
    channel.statusCallback!('SUBSCRIBED');
    channel.statusCallback!('CHANNEL_ERROR', new Error('boom'));

    expect(onStatus.mock.calls).toEqual([[true], [false]]);

    consoleErrorSpy.mockRestore();
  });

  it('should return null rather than throw when the channel cannot be set up', () => {
    mockedCreateClient.mockImplementation(() => {
      throw new Error('no client');
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(subscribeToGame('game-1', jest.fn())).toBeNull();

    consoleErrorSpy.mockRestore();
  });
});

describe('unsubscribeFromGame', () => {
  it('should remove the channel', async () => {
    const client = fakeClient();
    const channel = subscribeToGame('game-1', jest.fn());

    await unsubscribeFromGame(channel);

    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('should accept a channel that was never created', async () => {
    const client = fakeClient();

    await unsubscribeFromGame(null);

    expect(client.removeChannel).not.toHaveBeenCalled();
  });
});
