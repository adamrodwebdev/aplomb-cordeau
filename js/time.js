/** Time and chance, injected everywhere: no hidden clock or randomness in the rules. */

export class Clock {
  /** Seconds, monotonic */
  now() {
    return performance.now() / 1000;
  }
}

/** mulberry32: a small seeded generator, so every drift throws the same spray. */
export class SeededRandom {
  #state;

  constructor(seed) {
    this.#state = seed >>> 0;
  }

  next() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }
}

/** Resolves on the next task, so a long boot is cut into short tasks (no long task). */
export function nextTask() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
}
