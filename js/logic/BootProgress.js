/**
 * How far the scene's boot has come, from 0 to 1 (the story gate's bar, 2026-11-17). The boot tells
 * it each step it reaches and the body's bytes as they come; the value only grows; listeners hear
 * each change, and `changedAt` tells the watchdog whether the boot still moves. Time comes from the
 * injected `now` (milliseconds). No DOM, no three.js.
 */
import { BOOT_STEPS, bootPhase, bytesShare, codeShare } from '../rules/boot.js';

export class BootProgress {
  #now;
  #value = 0;
  #codeFiles = 0;
  #received = 0;
  #changedAt;
  #listeners = new Set();

  constructor(now) {
    this.#now = now;
    this.#changedAt = now();
  }

  /** 0 to 1 */
  get value() {
    return this.#value;
  }

  /** 'files', 'engine' or 'ready' (rules/boot.js) */
  get phase() {
    return bootPhase(this.#value);
  }

  get live() {
    return this.#value >= BOOT_STEPS.live;
  }

  /** When the boot last moved (a step, or new bytes of the body), on the injected clock */
  get changedAt() {
    return this.#changedAt;
  }

  /** A step of BOOT_STEPS is reached; any other name is ignored (an allow-list) */
  reach(step) {
    if (!Object.hasOwn(BOOT_STEPS, step)) return;
    this.#grow(BOOT_STEPS[step]);
  }

  /** One more of the scene's code files is in (the bar creeps toward the code's step) */
  codeFile() {
    this.#codeFiles += 1;
    this.#grow(codeShare(this.#codeFiles));
  }

  /**
   * The body's file: `received` bytes of `total`. New bytes are the boot moving even when the bar
   * cannot grow (past the file's expected size): the watchdog must not take a slow download for a stall.
   */
  bytes(received, total) {
    if (!Number.isSafeInteger(received) || received <= this.#received) return;
    this.#received = received;
    this.#changedAt = this.#now();
    this.#grow(bytesShare(received, total));
  }

  /** Calls `listener(progress)` on every change; returns the way to stop */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #grow(value) {
    if (!(value > this.#value)) return;
    this.#value = Math.min(BOOT_STEPS.live, value);
    this.#changedAt = this.#now();
    for (const listener of this.#listeners) listener(this);
  }
}
