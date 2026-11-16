/**
 * Where the car is, as pure functions of the scroll (the drift) or of time (the arrival).
 * Every pose is { x, z, heading, steer, distance }: metres on the ground, radians; heading 0 faces -Z,
 * positive turns left (three.js rotation about +Y).
 */
import { DEG, clamp, curve, easeInCubic, wrapAngle } from './math.js';

/** A cubic Bézier on the ground, with an arc-length table so distances map to points. */
export class GroundPath {
  #p;
  #samples;

  constructor(points) {
    this.#p = points.map(([x, z]) => ({ x, z }));
    const samples = [{ t: 0, s: 0 }];
    let previous = this.pointAt(0);
    let s = 0;
    for (let i = 1; i <= 160; i += 1) {
      const t = i / 160;
      const point = this.pointAt(t);
      s += Math.hypot(point.x - previous.x, point.z - previous.z);
      samples.push({ t, s });
      previous = point;
    }
    this.#samples = samples;
  }

  get length() {
    return this.#samples[this.#samples.length - 1].s;
  }

  pointAt(t) {
    const [a, b, c, d] = this.#p;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    return { x: w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x, z: w0 * a.z + w1 * b.z + w2 * c.z + w3 * d.z };
  }

  tangentAt(t) {
    const [a, b, c, d] = this.#p;
    const u = 1 - t;
    const x = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
    const z = 3 * u * u * (b.z - a.z) + 6 * u * t * (c.z - b.z) + 3 * t * t * (d.z - c.z);
    const n = Math.hypot(x, z) || 1;
    return { x: x / n, z: z / n };
  }

  /** The curve parameter at a distance along the path */
  tAt(distance) {
    const s = clamp(distance, 0, this.length);
    const list = this.#samples;
    let lo = 0;
    let hi = list.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (list[mid].s < s) lo = mid;
      else hi = mid;
    }
    const a = list[lo];
    const b = list[hi];
    return a.t + (b.t - a.t) * ((s - a.s) / (b.s - a.s || 1));
  }
}

/** The heading that faces a direction on the ground */
export const headingOf = (dir) => Math.atan2(-dir.x, -dir.z);

/** The drift at progress u (0 → 1): the car accelerates and its rear steps out. */
export function driftPose(plan, u) {
  const distance = clamp(u) ** 1.55 * plan.path.length;
  const t = plan.path.tAt(distance);
  const point = plan.path.pointAt(t);
  const travel = headingOf(plan.path.tangentAt(t));
  const slip = curve(plan.slip, clamp(u)) * DEG;
  return {
    x: point.x,
    z: point.z,
    heading: plan.start + wrapAngle(travel + plan.turn * slip - plan.start),
    steer: -plan.turn * Math.min(20 * DEG, 0.5 * slip), // counter-steer, half the slip, 20° at most
    distance,
    slip,
  };
}

export function driftPlan(layoutDrift) {
  const path = new GroundPath(layoutDrift.points);
  return { path, slip: layoutDrift.slip, turn: layoutDrift.turn, start: headingOf(path.tangentAt(0)) };
}

/** The arrival: cruise, brake at the threshold, a flick of the rear, stop on the mark. */
export function arrivalPlan(layoutArrival, profile) {
  const path = new GroundPath(layoutArrival.points);
  const { cruise, brake } = layoutArrival;
  const brakeTime = cruise / brake;
  const travel = cruise * profile.cruiseFor + (cruise * cruise) / (2 * brake);
  return {
    path,
    cruise,
    brake,
    cruiseFor: profile.cruiseFor,
    stopAt: profile.cruiseFor + brakeTime,
    travel,
    start: Math.max(0, path.length - travel),
    flick: profile.flick,
    flickSpan: profile.flickSpan,
    final: headingOf(path.tangentAt(1)),
  };
}

export function arrivalPose(plan, time, wheelbase) {
  const { cruise, brake, cruiseFor, stopAt } = plan;
  let s;
  let accel = 0;
  if (time <= 0) s = 0;
  else if (time < cruiseFor) s = cruise * time;
  else if (time < stopAt) {
    const k = time - cruiseFor;
    s = cruise * cruiseFor + cruise * k - 0.5 * brake * k * k;
    accel = -brake;
  } else s = plan.travel;
  const along = plan.start + s;
  const t = plan.path.tAt(along);
  const point = plan.path.pointAt(t);
  const travel = headingOf(plan.path.tangentAt(t));
  const flick = curve(plan.flick, time - (stopAt - plan.flickSpan)) * DEG;
  const ahead = headingOf(plan.path.tangentAt(plan.path.tAt(along + 0.5)));
  const curvature = wrapAngle(ahead - travel) / 0.5;
  return {
    x: point.x,
    z: point.z,
    heading: plan.final + wrapAngle(travel + flick - plan.final),
    steer: clamp(Math.atan(wheelbase * curvature) - flick * 1.4, -0.45, 0.45),
    distance: s,
    accel,
  };
}

/** Backing out to where the arrival started, in `seconds`, from where the car stood. */
export function leavePose(plan, fromTime, time, seconds, wheelbase) {
  const from = arrivalPose(plan, fromTime, wheelbase);
  const k = 1 - easeInCubic(clamp(time / seconds));
  const along = plan.start + from.distance * k;
  const t = plan.path.tAt(along);
  const point = plan.path.pointAt(t);
  return { x: point.x, z: point.z, heading: from.heading, steer: 0, distance: from.distance * k, accel: 0 };
}

/** Rolling forward out of the showroom as the page moves on (u: 0 → 1) */
export function exitPose(parked, u, distance) {
  const d = easeInCubic(clamp(u)) * distance;
  return {
    ...parked,
    x: parked.x - Math.sin(parked.heading) * d,
    z: parked.z - Math.cos(parked.heading) * d,
    distance: parked.distance + d,
    steer: 0,
  };
}

/** The rear tyres' contact patches on the ground */
export function rearContacts(pose, car) {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return car.rearWheels.map(([x, z]) => ({ x: pose.x + x * c + z * s, z: pose.z - x * s + z * c }));
}

/** All four contact patches, rear then front, each with its side (-1 left, +1 right of the car) */
export function wheelContacts(pose, car) {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return [...car.rearWheels, ...car.frontWheels].map(([x, z]) => ({
    x: pose.x + x * c + z * s,
    z: pose.z - x * s + z * c,
    side: Math.sign(x),
  }));
}

/**
 * The water thrown by the rear tyres in one drift, drawn once with a seeded random source. Each
 * particle is born where the rear tyres were at its birth `u`, so its age follows the scroll and
 * scrolling back rewinds it into the tyres. More water where the rear slips more and the car runs
 * faster; thinner as the car leaves, so its exit stays in sight. kind 0 is a droplet (ballistic),
 * kind 1 a puff of mist.
 */
export function sprayParticles(plan, car, spray, random, count) {
  // the spinning tyres throw water as soon as the car rolls (the drift's speed grows as u^0.55),
  // and more as the rear slips
  const table = [];
  let total = 0;
  for (let i = 0; i <= 200; i += 1) {
    const u = i / 200;
    const taper = 1 - 0.7 * clamp((u - 0.72) / 0.25);
    total += (0.25 + curve(plan.slip, u) / 35) * (0.12 + u ** 0.55) * taper;
    table.push({ u, c: total });
  }
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const roll = random.next();
    const target = random.next() * total;
    const hit = table.find((row) => row.c >= target) ?? table[table.length - 1];
    const u = clamp(hit.u + random.range(-0.0025, 0.0025));
    const pose = driftPose(plan, u);
    const back = { x: Math.sin(pose.heading), z: Math.cos(pose.heading) };
    const side = { x: back.z, z: -back.x };
    if (roll < spray.splashShare) {
      // a fan out of the side of any of the four tyres, low and short
      const wheels = wheelContacts(pose, car);
      const w = i % 4;
      const out = wheels[w].side;
      const s = spray.splash;
      const away = random.range(s.out[0], s.out[1]);
      const rear = random.range(s.back[0], s.back[1]);
      particles.push({
        birth: u,
        life: random.range(s.life[0], s.life[1]),
        size: random.range(s.size[0], s.size[1]),
        kind: 0,
        seed: random.next(),
        origin: [wheels[w].x + out * side.x * 0.14, random.range(0.02, 0.12), wheels[w].z + out * side.z * 0.14],
        velocity: [out * side.x * away + back.x * rear, random.range(s.lift[0], s.lift[1]), out * side.z * away + back.z * rear],
      });
      continue;
    }
    const mist = roll < spray.splashShare + spray.mistShare;
    const kind = mist ? spray.mist : spray.droplet;
    const wheel = rearContacts(pose, car)[i % 2];
    const thrown = random.range(kind.thrown[0], kind.thrown[1]);
    const lateral = random.range(-1, 1) * kind.spread;
    particles.push({
      birth: u,
      life: random.range(kind.life[0], kind.life[1]),
      size: random.range(kind.size[0], kind.size[1]),
      kind: mist ? 1 : 0,
      seed: random.next(),
      // off the back of the tyre, between the road and the top of the tread
      origin: [wheel.x + back.x * 0.32 + random.range(-0.1, 0.1), random.range(0.04, 0.34), wheel.z + back.z * 0.32 + random.range(-0.1, 0.1)],
      velocity: [back.x * thrown + side.x * lateral, random.range(kind.lift[0], kind.lift[1]), back.z * thrown + side.z * lateral],
    });
  }
  return particles;
}

/**
 * The sheet thrown at the visitor (SURGE): drops born at the two tyres nearest the camera while
 * `span` (drift u) lasts, more and more as the throw builds. Where each lands on the lens is an
 * offset from the tyre's own place on screen, in half-screens, since the camera's frame belongs to
 * the design; kind 3 carries [aim x, aim y, flight seconds] in `velocity`. `camera`: [x, y, z].
 */
export function surgeParticles(plan, car, { surge, random, count, span, camera }) {
  const [cx, , cz] = camera;
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const k = Math.sqrt(random.next());
    const u = span[0] + (span[1] - span[0]) * k;
    const pose = driftPose(plan, u);
    const wheels = wheelContacts(pose, car)
      .map((w) => ({ x: w.x, z: w.z, far: Math.hypot(cx - w.x, cz - w.z) }))
      .sort((a, b) => a.far - b.far);
    const wheel = wheels[i % 2];
    const toward = { x: (cx - wheel.x) / wheel.far, z: (cz - wheel.z) / wheel.far };
    const fan = surge.fan[0] + (surge.fan[1] - surge.fan[0]) * k * k;
    const angle = random.range(0, 2 * Math.PI);
    const reach = Math.sqrt(random.next()) * fan;
    const flight = random.range(surge.flight[0], surge.flight[1]);
    particles.push({
      birth: u,
      life: flight,
      size: random.range(surge.size[0], surge.size[1]),
      kind: 3,
      seed: random.next(),
      // off the tread on the camera's side, between the road and the top of the tyre
      origin: [wheel.x + toward.x * 0.3 + random.range(-0.12, 0.12), random.range(0.05, 0.4), wheel.z + toward.z * 0.3 + random.range(-0.12, 0.12)],
      velocity: [Math.cos(angle) * reach, Math.sin(angle) * reach * 0.7 + surge.lift * fan * random.range(0.3, 1), flight],
    });
  }
  return particles;
}

/** When the sheet's drops reach the glass, in drift u: the quantiles `shares` of their arrivals */
export function sheetArrivals(particles, seconds, shares) {
  const times = particles.filter((p) => p.kind === 3).map((p) => p.birth + p.life / seconds).sort((a, b) => a - b);
  if (times.length === 0) return shares.map(() => 1);
  return shares.map((share) => times[Math.min(times.length - 1, Math.floor(share * times.length))]);
}

/**
 * Each rear tyre's trace through the drift: samples of u, the contact point, the distance it has
 * run along its trace and the slip (degrees). Index 0 is the left tyre, 1 the right one.
 */
export function traceSamples(plan, car, steps = 600) {
  const traces = [[], []];
  const run = [0, 0];
  let previous = null;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const pose = driftPose(plan, u);
    const contacts = rearContacts(pose, car);
    contacts.forEach((c, w) => {
      if (previous) run[w] += Math.hypot(c.x - previous[w].x, c.z - previous[w].z);
      traces[w].push({ u, x: c.x, z: c.z, s: run[w], slip: pose.slip / DEG });
    });
    previous = contacts;
  }
  return traces;
}

/** The sample of a trace at a distance along it (interpolated), with its direction of travel */
export function traceAt(trace, s) {
  let i = 1;
  while (i < trace.length - 1 && trace[i].s < s) i += 1;
  const a = trace[i - 1];
  const b = trace[i];
  const k = clamp((s - a.s) / (b.s - a.s || 1));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = Math.hypot(dx, dz) || 1;
  return { u: a.u + (b.u - a.u) * k, x: a.x + dx * k, z: a.z + dz * k, dx: dx / n, dz: dz / n };
}

/**
 * Where a line of letters sits along a trace: from `startAt` metres after the tyre starts to slip,
 * each glyph centred on the trace, upright for the camera (reading towards +X on the ground, its
 * top towards -Z, as the camera looks down -Z). When the trace runs towards -X the words read
 * against the travel, so the last letter is written first. `advances` are the glyphs' widths in
 * metres; returns the window [from, to] in trace distance and, per glyph, where and when it appears.
 */
export function placeOnTrace(trace, advances, startAt, minSlip) {
  const slipping = trace.find((p) => p.slip >= minSlip) ?? trace[0];
  const total = advances.reduce((sum, a) => sum + a, 0);
  const from = slipping.s + startAt;
  const to = Math.min(from + total, trace[trace.length - 1].s);
  const mid = traceAt(trace, (from + to) / 2);
  const reversed = mid.dx < 0; // travelling towards -X: the words read against the travel
  let offset = 0;
  const glyphs = advances.map((advance) => {
    const centre = offset + advance / 2;
    offset += advance;
    const at = traceAt(trace, reversed ? to - centre : from + centre);
    const dir = reversed ? { x: -at.dx, z: -at.dz } : { x: at.dx, z: at.dz };
    return { u: at.u, x: at.x, z: at.z, angle: Math.atan2(dir.z, dir.x) };
  });
  return { from, to, reversed, glyphs };
}
