/**
 * When the car's engine sounds at the exit, and what it does (no audio, no three.js). Off in the
 * showroom; it starts as the car begins to roll out, then follows the car: its speed picks the gear
 * and the engine speed, its acceleration the load. Once the exit is over (the car out of the
 * showroom), it drives away on its own and fades. Rolled back onto its mark and left standing, it
 * idles a moment and stops. `update` returns what the sound does this frame.
 */
import { CAR } from '../rules/choreography.js';
import { loadFor, motorHz, sixStep } from '../rules/engine.js';

const MOVED = 0.002; // the exit's share past which the car has started to roll
const ROLLING = 0.1; // m/s: the car moves (it starts the engine)
const STANDING = 0.05; // m/s: the car stands
const STOP_ON_MARK = 1.5; // seconds standing back on the mark before the engine stops
const STOP_ELSEWHERE = 6; // seconds standing anywhere else (the visitor left it mid-exit)
const SMOOTH = 0.12; // seconds: the speed and acceleration are smoothed (the scroll comes in uneven steps)

export class ExitEngine {
  #state = 'off'; // 'off' | 'running' | 'away'
  #gear = 0;
  #speed = 0;
  #accel = 0;
  #travel = null;
  #standing = 0;

  get state() {
    return this.#state;
  }

  /**
   * `exitU`: the exit's progress (0 on the mark, 1 out of the showroom); `travel`: metres rolled from
   * the mark; `dt`: seconds since the last frame. Returns { state, ignite, away, back, stop, shifted,
   * rpm, gear, load, speed, whineHz }.
   */
  update({ exitU, travel, dt }) {
    const step = Math.max(dt, 1 / 240);
    const raw = this.#travel === null ? 0 : (travel - this.#travel) / step;
    this.#travel = travel;
    const k = 1 - Math.exp(-step / SMOOTH);
    const speed = this.#speed + (raw - this.#speed) * k;
    this.#accel += ((speed - this.#speed) / step - this.#accel) * k;
    this.#speed = speed;
    const events = { ignite: false, away: false, back: false, stop: false, shifted: false };
    if (this.#state === 'off') {
      if (exitU <= MOVED || Math.abs(this.#speed) < ROLLING) return { state: 'off', ...events, ...this.#idle() };
      this.#state = 'running';
      this.#gear = 0;
      this.#standing = 0;
      events.ignite = true;
    }
    if (this.#state === 'running' && exitU >= 1) {
      this.#state = 'away';
      events.away = true;
    } else if (this.#state === 'away' && exitU < 1) {
      this.#state = 'running';
      events.back = true;
    }
    if (this.#state === 'running') {
      this.#standing = Math.abs(this.#speed) < STANDING ? this.#standing + step : 0;
      if (this.#standing > (exitU <= MOVED ? STOP_ON_MARK : STOP_ELSEWHERE)) {
        this.#state = 'off';
        events.stop = true;
        return { state: 'off', ...events, ...this.#idle() };
      }
    }
    const load = loadFor(this.#accel);
    const drive = sixStep({ gear: this.#gear, speed: this.#speed, load, wheelRadius: CAR.wheelRadius });
    events.shifted = drive.shifted;
    this.#gear = drive.gear;
    return { state: this.#state, ...events, rpm: drive.rpm, gear: drive.gear, load, speed: this.#speed, whineHz: motorHz(this.#speed, CAR.wheelRadius) };
  }

  #idle() {
    return { rpm: 0, gear: 0, load: 0, speed: this.#speed, whineHz: 0 };
  }
}
