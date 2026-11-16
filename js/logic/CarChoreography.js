/**
 * The car's pose for each frame: the drift (scroll), the arrival and the exit (their own clock),
 * and the body on its springs, driven by the accelerations it feels (weight transfer). No three.js.
 */
import { ARRIVAL, CAR, LANDING, SUSPENSION } from '../rules/choreography.js';
import { DEG, clamp, remap, smoothstep, springStep, wrapAngle } from '../rules/math.js';
import { arrivalPlan, arrivalPose, driftPlan, driftPose, exitPose, leavePose } from '../rules/drift.js';

const SWAP_AT = (LANDING.swap[0] + LANDING.swap[1]) / 2;
const TURN_SPRING = { omega: 7, zeta: 0.95 };

export class CarChoreography {
  #drift;
  #arrival;
  #pitch = { x: 0, v: 0 };
  #roll = { x: 0, v: 0 };
  #turn = { x: 0, v: 0 };
  #turnTarget = 0;
  #previous = null;

  constructor(layout) {
    this.#drift = driftPlan(layout.drift);
    this.#arrival = arrivalPlan(layout.arrival, ARRIVAL);
  }

  /** The drift's plan, for the spray and the traces drawn along it */
  get drift() {
    return this.#drift;
  }

  /** When the arrival stops on the mark, on its own clock */
  get stopAt() {
    return this.#arrival.stopAt;
  }

  turnBy(radians) {
    this.#turnTarget += radians;
  }

  resetTurn() {
    this.#turnTarget = 0;
  }

  /** The full pose for this frame */
  frame(progress, arrival, dt) {
    const pose = this.#basePose(progress, arrival, dt);
    const accel = this.#accelerations(pose, dt);
    const squat = SUSPENSION.squat * smoothstep(0.04, 0.2, progress) * (1 - smoothstep(0.3, 0.55, progress));
    const pitchTarget = clamp(-accel.long * SUSPENSION.pitchPerAccel, -SUSPENSION.maxPitch, SUSPENSION.maxPitch) - squat;
    const rollTarget = clamp(accel.lat * SUSPENSION.rollPerAccel, -SUSPENSION.maxRoll, SUSPENSION.maxRoll);
    this.#pitch = springStep(this.#pitch, pitchTarget, SUSPENSION.pitch, dt);
    this.#roll = springStep(this.#roll, rollTarget, SUSPENSION.roll, dt);
    return { ...pose, pitch: this.#pitch.x * DEG, roll: this.#roll.x * DEG };
  }

  /** True while the body still moves on its springs */
  get settling() {
    return Math.abs(this.#pitch.v) + Math.abs(this.#roll.v) + Math.abs(this.#turn.v) > 0.02;
  }

  #basePose(progress, arrival, dt) {
    const r = CAR.wheelRadius;
    if (progress < SWAP_AT) {
      const u = remap(progress, LANDING.drift[0], LANDING.drift[1]);
      const pose = driftPose(this.#drift, u);
      const wake = remap(progress, LANDING.wake[0], LANDING.wake[1]);
      const spin = -pose.distance / r;
      return {
        ...pose,
        steer: pose.steer + Math.sin(Math.PI * wake) * 8 * DEG, // a flick of the wheel before the slide
        spinFront: spin,
        spinRear: spin * (1 + 0.6 * smoothstep(0.1, 0.4, u)), // the rear tyres spin faster: they slide
        lights: 0.55 + 0.45 * smoothstep(0, 0.15, progress),
        visible: u < 0.999,
        place: 'road',
        u,
      };
    }
    this.#turn = springStep(this.#turn, this.#turnTarget, TURN_SPRING, dt);
    const showroom = { place: 'showroom', lights: 1, u: 1 };
    if (arrival.state === 'away') return { ...showroom, x: 0, z: 0, heading: this.#arrival.final, steer: 0, distance: 0, spinFront: 0, spinRear: 0, visible: false };
    let pose;
    if (arrival.state === 'leaving') {
      pose = leavePose(this.#arrival, arrival.leaveFrom, arrival.clock, ARRIVAL.leaveSeconds, CAR.wheelbase);
    } else {
      pose = arrivalPose(this.#arrival, arrival.clock, CAR.wheelbase);
      pose = { ...pose, heading: pose.heading + this.#turn.x };
      const exitU = remap(progress, LANDING.exit[0], LANDING.exit[1]);
      if (exitU > 0) pose = exitPose(pose, exitU, ARRIVAL.exitDistance);
    }
    const spin = -pose.distance / r;
    return { ...showroom, ...pose, spinFront: spin, spinRear: spin, visible: true };
  }

  /** Longitudinal and lateral accelerations (m/s², left positive), from frame to frame */
  #accelerations(pose, dt) {
    const previous = this.#previous;
    const step = Math.max(dt, 1 / 240);
    const now = { x: pose.x, z: pose.z, place: pose.place, vx: 0, vz: 0, speed: 0, travel: pose.heading };
    let long = 0;
    let lat = 0;
    if (previous && previous.place === pose.place && Math.hypot(pose.x - previous.x, pose.z - previous.z) < 3) {
      now.vx = (pose.x - previous.x) / step;
      now.vz = (pose.z - previous.z) / step;
      const forward = { x: -Math.sin(pose.heading), z: -Math.cos(pose.heading) };
      now.speed = now.vx * forward.x + now.vz * forward.z;
      const moving = Math.hypot(now.vx, now.vz);
      now.travel = moving > 0.3 ? Math.atan2(-now.vx, -now.vz) : previous.travel;
      long = (now.speed - previous.speed) / step;
      lat = moving > 0.3 ? (moving * wrapAngle(now.travel - previous.travel)) / step : 0;
    }
    this.#previous = now;
    const max = SUSPENSION.maxAccel;
    return { long: clamp(long, -max, max), lat: clamp(lat, -max, max) };
  }
}
