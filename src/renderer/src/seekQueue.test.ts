import { describe, expect, it } from 'vitest';

import { createSeekQueue } from './seekQueue';

function setup() {
  const seeks: number[] = [];
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const queue = createSeekQueue({
    seek: (t) => seeks.push(t),
    schedule: (fn) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, fn);
      return id;
    },
    cancel: (id) => { timers.delete(id as number); },
  });
  const fireSafety = () => [...timers.values()].forEach((fn) => fn());
  return { queue, seeks, timers, fireSafety };
}

describe('createSeekQueue', () => {
  it('seeks straight away when nothing is in flight', () => {
    const { queue, seeks } = setup();
    queue.request(5);
    expect(seeks).toEqual([5]);
  });

  it('keeps only the newest time while a seek runs, and sends it when the seek lands', () => {
    const { queue, seeks } = setup();
    queue.request(1);
    queue.request(2);
    queue.request(3);
    queue.request(4);
    expect(seeks).toEqual([1]);
    queue.landed();
    expect(seeks).toEqual([1, 4]);
    queue.landed();
    expect(seeks).toEqual([1, 4]);
  });

  it('always ends on the last requested time, however long the drag', () => {
    const { queue, seeks } = setup();
    for (let i = 0; i < 50; i += 1) {
      queue.request(i);
      if (i % 3 === 0) queue.landed();
    }
    queue.landed();
    queue.landed();
    expect(seeks.at(-1)).toBe(49);
  });

  it('a slow seek does not let a later request jump ahead of the waiting one', () => {
    const { queue, seeks } = setup();
    queue.request(10);
    queue.request(20);
    // Before: a 1 s timer could clear the in-flight flag and let 30 be sent while 10 was still seeking,
    // after which the parked 20 landed last and the picture ended on the wrong frame.
    queue.request(30);
    queue.landed();
    expect(seeks).toEqual([10, 30]);
  });

  it('a seek that never reports back unblocks after the safety timeout', () => {
    const { queue, seeks, fireSafety } = setup();
    queue.request(1);
    queue.request(2);
    fireSafety();
    expect(seeks).toEqual([1, 2]);
  });

  it('reset drops the waiting time and the in-flight state', () => {
    const { queue, seeks, timers } = setup();
    queue.request(1);
    queue.request(2);
    queue.reset();
    expect(timers.size).toBe(0);
    queue.request(3);
    expect(seeks).toEqual([1, 3]);
  });
});
