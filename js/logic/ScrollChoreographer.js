/**
 * Follows the scroll with a little lag (the "scrub"), which gives the drift its weight. The page
 * scrolls natively: this only smooths the progress the scene reads.
 */
export class ScrollChoreographer {
  #target = 0;
  #value = 0;
  #velocity = 0;
  #tau;

  constructor(tau) {
    this.#tau = tau;
  }

  aim(progress) {
    this.#target = progress;
  }

  jump(progress) {
    this.#target = progress;
    this.#value = progress;
    this.#velocity = 0;
  }

  step(dt) {
    const before = this.#value;
    this.#value += (this.#target - this.#value) * (1 - Math.exp(-dt / this.#tau));
    if (Math.abs(this.#target - this.#value) < 1e-4) this.#value = this.#target;
    this.#velocity = (this.#value - before) / Math.max(dt, 1e-4);
  }

  get progress() {
    return this.#value;
  }

  /** Screens per second */
  get velocity() {
    return this.#velocity;
  }

  get settled() {
    return this.#value === this.#target;
  }
}
