/**
 * Tests for the commentator's stage: one line at a time, out of the way of
 * the full-screen moments
 */

import { CommentaryQueue, LINE_MS, DUEL_MS, MAX_WAITING, STALE_MS } from '../commentary-queue';
import type { DuelPlayer } from '../commentary';

const DUELLISTS: DuelPlayer[] = [
  { id: 'a', name: 'Anna', avatar: '🎱', lives: 2 },
  { id: 'b', name: 'Boris', avatar: '🎯', lives: 3 },
];

let clock = 0;
const now = () => clock;

function advance(ms: number) {
  clock += ms;
  jest.advanceTimersByTime(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  clock = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

const showing = (queue: CommentaryQueue) => queue.getSnapshot().line?.text ?? null;

describe('lines', () => {
  it('should show a line at once and take it down after its time', () => {
    const queue = new CommentaryQueue(now);
    queue.say('last_life', 'Anna is hanging by a thread.');

    expect(showing(queue)).toBe('Anna is hanging by a thread.');
    advance(LINE_MS - 1);
    expect(showing(queue)).not.toBeNull();
    advance(1);
    expect(showing(queue)).toBeNull();
  });

  it('should show lines one after another, in order', () => {
    const queue = new CommentaryQueue(now);
    queue.say('on_fire', 'One');
    queue.say('eliminated', 'Two');
    queue.say('final_duel', 'Three');

    const seen = [showing(queue)];
    advance(LINE_MS);
    seen.push(showing(queue));
    advance(LINE_MS);
    seen.push(showing(queue));
    advance(LINE_MS);
    seen.push(showing(queue));

    expect(seen).toEqual(['One', 'Two', 'Three', null]);
  });

  it('should keep only the newest lines when they pile up', () => {
    const queue = new CommentaryQueue(now);
    queue.say('on_fire', 'On screen');
    for (let i = 1; i <= MAX_WAITING + 2; i++) queue.say('on_fire', `Waiting ${i}`);

    const seen: Array<string | null> = [];
    for (let i = 0; i <= MAX_WAITING; i++) {
      advance(LINE_MS);
      seen.push(showing(queue));
    }

    expect(seen).toEqual(['Waiting 3', 'Waiting 4', 'Waiting 5', null]);
  });

  it('should drop a line that waited too long', () => {
    const queue = new CommentaryQueue(now);
    queue.setHeld(true);
    queue.say('last_life', 'Old news');
    advance(STALE_MS + 1);
    queue.say('eliminated', 'Fresh');
    queue.setHeld(false);

    expect(showing(queue)).toBe('Fresh');
  });

  it('should give every line its own id', () => {
    const queue = new CommentaryQueue(now);
    queue.say('on_fire', 'Same words');
    const first = queue.getSnapshot().line!.id;
    advance(LINE_MS);
    queue.say('on_fire', 'Same words');

    expect(queue.getSnapshot().line!.id).not.toBe(first);
  });
});

describe('holding', () => {
  it('should keep lines back while held', () => {
    // The black-ball celebration has the screen
    const queue = new CommentaryQueue(now);
    queue.setHeld(true);
    queue.say('black_on_last_life', 'CHYORNY!');
    expect(showing(queue)).toBeNull();

    queue.setHeld(false);
    expect(showing(queue)).toBe('CHYORNY!');
  });

  it('should send a line on screen aside and bring it back in full', () => {
    const queue = new CommentaryQueue(now);
    queue.say('on_fire', 'Three in a row');
    advance(LINE_MS - 500);

    queue.setHeld(true);
    expect(showing(queue)).toBeNull();
    advance(2000);
    queue.setHeld(false);

    expect(showing(queue)).toBe('Three in a row');
    advance(LINE_MS - 1);
    expect(showing(queue)).toBe('Three in a row');
  });
});

describe('the final-duel overlay', () => {
  it('should be up for its time and then let the lines through', () => {
    const queue = new CommentaryQueue(now);
    queue.showDuel(DUELLISTS);
    queue.say('final_duel', 'Pistols at dawn');

    expect(queue.getSnapshot().duel?.players).toEqual(DUELLISTS);
    expect(showing(queue)).toBeNull();

    advance(DUEL_MS);
    expect(queue.getSnapshot().duel).toBeNull();
    expect(showing(queue)).toBe('Pistols at dawn');
  });

  it('should send a line on screen aside', () => {
    const queue = new CommentaryQueue(now);
    queue.say('streak_broken', 'Streak over');
    queue.showDuel(DUELLISTS);

    expect(showing(queue)).toBeNull();
    advance(DUEL_MS);
    expect(showing(queue)).toBe('Streak over');
  });

  it('should wait for a celebration that outlasts it', () => {
    const queue = new CommentaryQueue(now);
    queue.setHeld(true);
    queue.showDuel(DUELLISTS);
    queue.say('final_duel', 'Two left');
    advance(DUEL_MS);

    expect(showing(queue)).toBeNull();
    queue.setHeld(false);
    expect(showing(queue)).toBe('Two left');
  });
});

describe('subscribers', () => {
  it('should be told of every change, and get the same snapshot in between', () => {
    const queue = new CommentaryQueue(now);
    const listener = jest.fn();
    const unsubscribe = queue.subscribe(listener);

    const before = queue.getSnapshot();
    expect(queue.getSnapshot()).toBe(before);

    queue.say('last_life', 'Hands steady');
    expect(listener).toHaveBeenCalled();
    expect(queue.getSnapshot()).not.toBe(before);

    unsubscribe();
    listener.mockClear();
    advance(LINE_MS);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('clear', () => {
  it('should take everything down and stop the timers', () => {
    const queue = new CommentaryQueue(now);
    queue.showDuel(DUELLISTS);
    queue.say('final_duel', 'Two left');
    queue.say('eliminated', 'Gone');

    queue.clear();
    expect(queue.getSnapshot()).toEqual({ line: null, duel: null });

    advance(DUEL_MS + LINE_MS * 3);
    expect(queue.getSnapshot()).toEqual({ line: null, duel: null });
  });

  it('should leave the queue usable', () => {
    // React's StrictMode cleans effects up once and runs them again
    const queue = new CommentaryQueue(now);
    queue.setHeld(true);
    queue.clear();

    queue.say('victory', 'Anna wins!');
    expect(showing(queue)).toBe('Anna wins!');
  });
});
