/** Small pure helpers: no state, no DOM, no three.js. */

export const DEG = Math.PI / 180;

export const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** 0 before a, 1 after b, linear between */
export const remap = (x, a, b) => clamp((x - a) / (b - a));

export const smoothstep = (a, b, x) => {
  const t = remap(x, a, b);
  return t * t * (3 - 2 * t);
};

export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** Eases from key to key (smoothstep), resting on each: [x, y] keys in order of x */
export function keyframes(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (x <= keys[i][0]) {
      const [x0, y0] = keys[i - 1];
      const [x1, y1] = keys[i];
      return y0 + (y1 - y0) * smoothstep(x0, x1, x);
    }
  }
  return keys[keys.length - 1][1];
}

/** An angle brought back to (-π, π] */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A smooth curve through [x, y] keys (cubic Hermite with Catmull-Rom slopes, flat at both ends).
 * Used for the slip angle and the arrival's flick, which are tuned as data.
 */
export function curve(keys, x) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (x > keys[i][0]) i += 1;
  const [x0, y0] = keys[i - 1];
  const [x1, y1] = keys[i];
  const slope = (j) => (j <= 0 || j >= n - 1 ? 0 : (keys[j + 1][1] - keys[j - 1][1]) / (keys[j + 1][0] - keys[j - 1][0]));
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * slope(i - 1) * h + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * slope(i) * h;
}

/**
 * One step of a damped spring toward a target, sub-stepped so a long frame stays stable.
 * `omega` is the natural frequency in rad/s, `zeta` the damping ratio (below 1 overshoots).
 */
export function springStep(state, target, { omega, zeta }, dt) {
  let { x, v } = state;
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a = -2 * zeta * omega * v - omega * omega * (x - target);
    v += a * h;
    x += v * h;
  }
  return { x, v };
}
