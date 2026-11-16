/**
 * The Cordeau's drivetrains as the exit's sound hears them (pure numbers, no audio). The Six: a
 * twin-turbo straight-six, three firing pulses per turn of the crank, an eight-speed automatic whose
 * converter lets the engine run ahead of the wheels at a standstill. The E: one motor, one reduction.
 */
import { clamp } from './math.js';

export const SIX = Object.freeze({
  idleRpm: 820,
  redlineRpm: 6800,
  launchRpm: 1700, // the converter's stall under full load, the car still standing
  gears: Object.freeze([5.0, 3.2, 2.14, 1.72, 1.31, 1.0, 0.82, 0.64]),
  finalDrive: 3.15,
  upshiftRpm: Object.freeze([2300, 5600]), // under a light load, under a full one
  downshiftRpm: 1150,
});

export const E = Object.freeze({
  reduction: 9.1,
  polePairs: 4, // the motor's whine: its electrical frequency, pole pairs × turns per second
});

/** The exhaust's fundamental: a four-stroke six fires three times a turn */
export function firingHz(rpm) {
  return (rpm / 60) * 3;
}

/** Wheel turns per minute at a speed (m/s, either way) */
export function wheelRpm(speed, wheelRadius) {
  return (Math.abs(speed) / (2 * Math.PI * wheelRadius)) * 60;
}

/**
 * The Six's next gear and engine speed: `gear` the current one (0 is first), `speed` m/s, `load`
 * 0 to 1. Shifts up past the load's shift point, down below `downshiftRpm`, one gear a step.
 */
export function sixStep({ gear, speed, load, wheelRadius }, six = SIX) {
  const wheels = wheelRpm(speed, wheelRadius) * six.finalDrive;
  const up = six.upshiftRpm[0] + (six.upshiftRpm[1] - six.upshiftRpm[0]) * clamp(load);
  let next = clamp(Math.round(gear), 0, six.gears.length - 1);
  if (wheels * six.gears[next] > up && next < six.gears.length - 1) next += 1;
  else if (wheels * six.gears[next] < six.downshiftRpm && next > 0) next -= 1;
  const converter = six.idleRpm + (six.launchRpm - six.idleRpm) * clamp(load);
  const rpm = clamp(Math.max(wheels * six.gears[next], converter), six.idleRpm, six.redlineRpm);
  return { gear: next, rpm, shifted: next > gear };
}

/** The E's motor whine (Hz) at a speed (m/s) */
export function motorHz(speed, wheelRadius, e = E) {
  return (wheelRpm(speed, wheelRadius) * e.reduction / 60) * e.polePairs;
}

/** How hard the engine pulls (0.12 coasting to 1) for an acceleration along the car (m/s²) */
export function loadFor(accel) {
  return clamp(0.12 + accel / 5, 0.12, 1);
}
