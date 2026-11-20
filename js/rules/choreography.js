/**
 * The landing's choreography as data (docs/landing.md), tuned without touching the code.
 * Scroll is counted in screen heights from the top of the landing ("p"). Lengths are metres,
 * angles degrees, times seconds. three.js frame: +Y up, the car's nose towards -Z.
 */

export const LANDING = Object.freeze({
  screens: 6.3, // the pinned landing's length, in screen heights (drift.css --screens)
  wake: [0, 0.2],
  drift: [0.2, 1.0],
  // the headline gives way just before the thrown water lands on the glass (from the first drops'
  // landing, which each layout's throw sets); its words stay written in the water
  roadCopyOut: [-0.1, 0.02],
  // then the tyres throw their sheet of water at the lens (each layout's `surge`); the glass drowns
  // where the first drops land, and stays drowned while the stage turns from road to showroom
  swap: [1.0, 1.08],
  captionIn: [0.92, 1.0],
  captionOut: [1.12, 1.2],
  screenClear: [1.12, 1.5], // the water runs off the glass, top first, onto the showroom
  arriveAt: 1.56, // the arrival plays on its own clock from here…
  leaveAt: 1.42, // …and the car backs out above this
  showCopyIn: [1.66, 1.92],
  showCopyOut: [2.85, 3.0], // the showroom's words give way as the camera goes to the cabin
  exit: [5.85, 6.3], // the car rolls out as configured, once the journey is over
  driftSeconds: 2.6, // the drift's length in seconds, so the spray ages with the scroll (and rewinds)
  // the road headline sharpens as the rear steps out
  tension: [[0, 0], [0.2, 0.3], [0.45, 0.75], [0.75, 1], [1, 1]],
  scrubSeconds: 0.18, // time constant of the scroll smoothing (about 0.5 s to settle)
});

/**
 * The tonal arc (direction C, the user's choice of 2026-11-16): the light behind the scene follows
 * the story. Dawn on the road; the studio for the showroom, the exterior and the cabin (white or
 * night, by the visitor's theme); the energy's own light once the camera leaves the cabin for the
 * bonnet (the workshop for the Six, the blue night for the E); dusk as the car is shown finished and
 * leaves; the page's own light once the landing has scrolled away.
 */
export const ARC = Object.freeze({
  energyFrom: 4.5, // the camera leaves the cabin for the open bay (JOURNEY.camera's 'door' to 'engine')
  duskFrom: 5.52, // the camera steps back for the finale
});

/** The environment the paint reflects under each light of the arc; the studio's follows the visitor's theme */
export function arcEnvironment(light, theme) {
  if (light === 'dawn') return 'road';
  if (light === 'workshop' || light === 'night' || light === 'dusk') return light;
  return theme === 'light' ? 'studio-white' : 'showroom';
}

/** A new paint is shown by a light sweeping its flank: the studio turns this far about the car, and back */
export const PAINT_SWEEP = Object.freeze({ seconds: 1.4, degrees: 50 });

/**
 * The plumb line's chapters, its ticks (the user's request of 2026-11-16: a keyboard table of
 * contents): where each is read, in screens. Each lies inside the range where its panel shows
 * (JOURNEY.chapters), so a jump lands on the chapter whole.
 */
export const CHAPTER_INDEX = Object.freeze([
  Object.freeze({ id: 'road', at: 0 }),
  Object.freeze({ id: 'showroom', at: 1.8 }),
  Object.freeze({ id: 'exterior', at: 2.4 }),
  Object.freeze({ id: 'cabin', at: 3.6 }),
  Object.freeze({ id: 'energy', at: 5.1 }),
  Object.freeze({ id: 'yours', at: 5.95 }),
]);

/** The chapter read at `p` screens (its index): the last one whose start, half-way from the one before, is passed */
export function chapterAt(p) {
  let index = 0;
  for (let k = 1; k < CHAPTER_INDEX.length; k += 1) {
    if (p >= (CHAPTER_INDEX[k - 1].at + CHAPTER_INDEX[k].at) / 2) index = k;
  }
  return index;
}

/** The light of the arc at `p` screens, in a place, for the configured energy ('six' or 'e') */
export function arcLight(place, p, energy) {
  if (place === 'road') return 'dawn';
  if (p > LANDING.screens + 0.02) return 'page';
  if (p >= ARC.duskFrom) return 'dusk';
  if (p >= ARC.energyFrom) return energy === 'e' ? 'night' : 'workshop';
  return 'studio';
}

export const CAR = Object.freeze({
  wheelRadius: 0.405,
  wheelbase: 2.92,
  cgHeight: 0.55,
  rearWheels: [[-0.87, 1.46], [0.87, 1.46]], // [x, z] in the car's frame (rear at +Z): pass 7's tracks
  frontWheels: [[-0.85, -1.46], [0.85, -1.46]],
  shadowPlate: [3.5, 6.3], // the baked contact shadow, width × length (c7export.py PLATE)
  // the hinges the landing turns: the driver's door now, the bonnet in the engine chapter (phase 3);
  // every other part of the master is drawn merged
  hinges: Object.freeze(['CTL_door_FL', 'CTL_bonnet']),
});

export const SUSPENSION = Object.freeze({
  pitchPerAccel: 0.16, // degrees of pitch per m/s² of longitudinal acceleration
  rollPerAccel: 0.2,
  maxPitch: 2.2,
  maxRoll: 2.6,
  maxAccel: 12,
  squat: 1.0, // the wake's squat, nose up
  pitch: { omega: 11.3, zeta: 0.38 }, // one visible rebound when the brakes let go
  roll: { omega: 9.4, zeta: 0.42 },
});

export const ARRIVAL = Object.freeze({
  cruiseFor: 0.34,
  flickSpan: 0.36, // the flick ends with the stop
  flick: [[0, 0], [0.13, 6], [0.25, -2], [0.36, 0]], // yaw over the heading, degrees
  parkAfter: 0.75, // after the stop: the car is parked, the turntable wakes, the plumb line rests
  leaveSeconds: 0.55,
  exitDistance: 8,
});

/**
 * The water the rear tyres throw on the wet road (the user, 2026-11-10: water instead of smoke,
 * whose message about ecology is negative). Droplets fly ballistic and read as fine streaks; a
 * share is mist, thin and lit from behind, gone in a second (smoke lingers, water does not).
 * Speeds in m/s, sizes (radii) in metres.
 */
export const SPRAY = Object.freeze({
  minSlip: 6, // degrees of slip before the traces cut through the water
  mistShare: 0.08,
  // every tyre splashes as the car rolls (the user, 2026-11-10: "when the car moves, the water
  // should splash"): low fans thrown sideways, out of the tread
  splashShare: 0.36,
  ringShare: 0.3, // one fallen drop in three rings the water visibly
  droplet: { life: [0.45, 1.1], thrown: [2.4, 6.2], lift: [1.2, 3.8], spread: 1.8, size: [0.005, 0.012] },
  mist: { life: [0.4, 0.95], thrown: [1.2, 3.0], lift: [0.3, 1.1], spread: 1.0, size: [0.4, 1.2] },
  splash: { life: [0.35, 0.9], out: [1.4, 3.8], back: [0.2, 1.4], lift: [0.6, 2.1], size: [0.004, 0.01] },
});

/**
 * The sheet of water the tyres throw at the visitor, the landing's transition (the user,
 * 2026-11-10: "make the water rise from the tires to the screen"). While a layout's `surge` lasts,
 * drops leave the two tyres nearest the camera and each flies a ballistic arc to its own point on
 * the lens: the first close to where the tyres are on screen, the later ones fanned out and up,
 * until the glass is drowned. The screen's water starts where and when they land.
 */
export const SURGE = Object.freeze({
  share: 0.3, // of the spray's particles
  flight: [0.32, 0.6], // seconds from the tyre to the glass: the last land before the stage turns
  fan: [0.1, 1.5], // how far a drop's aim strays from the tyre on screen, first → last (half-screens)
  lift: 0.5, // the fan leans up: the sheet rises as it comes
  size: [0.004, 0.014],
  lens: 0.32, // metres before the camera where the water meets the glass
  aperture: 0.03, // the lens's opening, metres: drops close to the glass blur into soft discs
  arrived: [0.03, 0.9], // the screen's water starts when the first 3 % land, covers by 90 %
});

/**
 * The headline written by the drift: where each rear tyre pushes the water aside, its trace turns
 * into the words for a stretch (the user, 2026-11-10: "ONE LINE TWO ENERGIES follows the car's skid
 * marks on a wet floor"). The first line goes to the trace further from the camera.
 */
export const ROAD_TITLE = Object.freeze({
  lines: ['ONE LINE.', 'TWO ENERGIES.'],
  capHeight: 0.5, // metres
  startAt: 0.9, // metres of trace before the words
  tracking: 0.04, // extra space between letters, in cap heights
  trace: 0.27, // the tyre's width, metres
});

/**
 * The configurators journey after the showroom arrival (the user, 2026-11-10: the exterior, then
 * into the cabin, then the engine, then the car leaves as configured). Each chapter's panel holds
 * while the scroll is in its range; the camera runs through each layout's `journey` shots.
 */
export const JOURNEY = Object.freeze({
  chapters: Object.freeze([
    Object.freeze({ id: 'exterior', shown: [1.95, 2.85] }),
    Object.freeze({ id: 'cabin', shown: [3.45, 4.15] }),
    Object.freeze({ id: 'energy', shown: [4.75, 5.45] }),
    Object.freeze({ id: 'finale', shown: [5.62, 6.3] }),
  ]),
  // [scroll, shot]: the camera eases from one to the next ('showroom' is the layout's own)
  camera: Object.freeze([
    [1.0, 'showroom'], [1.92, 'showroom'], [2.04, 'exterior'], [2.86, 'exterior'], [3.14, 'door'], [3.42, 'cabin'],
    // the cabin: the dash, then a turn of the head to the rear seats (the user, 2026-11-15: "no
    // view of the back seats whatsoever"), back to the wheel, and out through the open door
    [3.7, 'cabin'], [3.9, 'rear'], [4.06, 'rear'], [4.24, 'cabin'], [4.44, 'door'], [4.72, 'engine'], [5.48, 'engine'], [5.8, 'finale'],
  ].map((key) => Object.freeze(key))),
  cabinLight: [3.08, 3.4, 4.2, 4.42], // a warm light in the cabin while the camera is in it
  cabinLux: 2.4, // the light's intensity, candela
  // the driver's door (the master's hinge, degrees: negative swings the left door out). It opens as
  // the camera comes to it, shuts once the camera sits at the driver's eye, opens to let it out and
  // shuts behind it, a real door's swing: [scroll, share of `open`]
  door: Object.freeze({
    hinge: 'CTL_door_FL',
    open: -62,
    keys: Object.freeze([[2.9, 0], [3.12, 1], [3.46, 1], [3.68, 0], [3.96, 0], [4.18, 1], [4.42, 1], [4.66, 0]].map((key) => Object.freeze(key))),
  }),
  blade: [2.92, 3.18], // the light blade welcomes the visitor as the door opens, and stays on
  // the energy chapter (phase 3, the user's choices of 2026-11-15): the bonnet lifts as the camera
  // comes round the nose, the engine (or the E's boot) opens into its exploded view as the visitor
  // scrolls and holds open while they choose, closes, and the bonnet shuts before the car leaves
  bonnet: Object.freeze({
    hinge: 'CTL_bonnet',
    open: 56, // degrees: positive lifts the front edge
    // open before the camera turns to the bay (the study session's measure, 2026-11-18: opening from 4.5
    // to 4.82, the half-open bonnet hid up to 94 % of the engine at 4.60; from 4.42 to 4.62, 0.3 % at most)
    keys: Object.freeze([[4.42, 0], [4.62, 1], [5.5, 1], [5.72, 0]].map((key) => Object.freeze(key))),
  }),
  explode: Object.freeze([[4.9, 0], [5.14, 1], [5.34, 1], [5.5, 0]].map((key) => Object.freeze(key))),
  notesFrom: 0.7, // the engine's notes show once the parts are this far apart
  engineLight: [4.45, 4.7, 5.5, 5.72], // a cool lamp over the open bay while the camera looks in (follows the bonnet)
  engineLux: 2.2, // its intensity, candela
  engineFrom: 2.0, // the engine set (1.5 MB since its parts are baked) is fetched from the exterior chapter on
  // the cabin's model (1.9 MB) is fetched once the visitor scrolls into the water transition, which
  // leaves 1.9 screens before the door opens; a visitor who stays on the road never pays for it
  cabinFrom: 1.0,
});

/** One framing per screen shape. `shift` moves the subject on screen (fraction of the frame). */
export const LAYOUTS = Object.freeze({
  landscape: {
    refAspect: 1.55, // narrower screens pull the camera back
    road: { position: [0, 1.35, 9.4], target: [0, 0.62, 0], fov: 30, shift: [0.1, 0.12] },
    // the car centred under the title, which it stands in front of (the tonal arc's depth, 2026-11-16)
    showroom: { position: [0.8, 1.32, 8.8], target: [0, 0.6, 0], fov: 30, shift: [0, -0.02] },
    drift: {
      points: [[1.35, 0.25], [0.48, 1.48], [-3.2, 1.25], [-9.4, -1.9]],
      slip: [[0, 0], [0.1, 0], [0.36, 24], [0.6, 35], [1, 30]],
      turn: -1, // a right-hand drift: the nose points further right than the travel
    },
    // the throw, in scroll: the rear faces the camera from 0.62, its right tyre is on screen to 0.84
    surge: [0.6, 0.82],
    arrival: { points: [[9.6, -0.6], [5.4, -1.7], [1.03, -1.23], [0, 0]], cruise: 10, brake: 10.8 },
    skid: { centre: [-4, 0], size: [28, 16] },
    // the journey's shots: 'world' framings, or 'car' ones that follow the parked car (metres in its
    // own frame: +Y up, nose to −Z, driver on −X); `inside` ones are never pulled back
    journey: {
      // the exterior and the cabin dock their choices under the car (the tonal arc): the car centred between the title and the dock
      exterior: { space: 'world', position: [-0.4, 1.4, 10.6], target: [0, 0.6, 0], fov: 28, shift: [0, 0.05] },
      // standing by the open door, eyes at 1.5 m: down through the opening onto the seat and the dash
      door: { space: 'car', position: [-2.75, 1.5, -0.12], target: [-0.45, 0.8, -0.3], fov: 44, shift: [0, 0] },
      // then seated, at the driver's eye (the master's CAM_cabin: z 0.16, 1.11 m), the display seen
      // over the rim
      cabin: { space: 'car', inside: true, position: [-0.37, 1.13, 0.15], target: [-0.24, 0.96, -1.8], fov: 62, shift: [0, -0.08] },
      // between the front seats at head height, turned round to the rear bench and its console
      rear: { space: 'car', inside: true, position: [0.02, 1.17, 0.02], target: [0.06, 0.74, 1.05], fov: 64, shift: [0, -0.08] },
      // above the open bay from the front right: the exploded engine rises into the frame
      engine: { space: 'car', position: [1.5, 2.55, -3.35], target: [0.0, 0.64, -1.25], fov: 34, shift: [-0.17, 0.03] },
      finale: { space: 'world', position: [0.8, 1.32, 9.6], target: [0, 0.6, 0], fov: 30, shift: [-0.16, 0.1] },
    },
  },
  portrait: {
    refAspect: 0.5,
    road: { position: [0, 2.4, 15.5], target: [0, 0.5, 0.6], fov: 36, shift: [0, 0.16] },
    showroom: { position: [0.5, 2.2, 15], target: [0, 0.5, 0], fov: 36, shift: [0, 0.15] },
    drift: {
      points: [[0.35, 0.6], [-0.35, 2.6], [-1.9, 5.6], [-4.6, 9.8]],
      slip: [[0, 0], [0.12, 0], [0.4, 22], [0.65, 30], [1, 26]],
      turn: -1,
    },
    surge: [0.5, 0.72], // the car comes at the camera and leaves the frame sooner
    arrival: { points: [[6.2, -1.6], [3.4, -2.6], [0.72, -0.86], [0, 0]], cruise: 8, brake: 10.2 },
    skid: { centre: [-2, 5], size: [14, 16] },
    // the panel is a sheet across the bottom: the car rides in the upper half
    journey: {
      exterior: { space: 'world', position: [0.5, 2.6, 15.5], target: [0, 0.5, 0], fov: 36, shift: [0, -0.2] },
      door: { space: 'car', position: [-3.3, 1.55, -0.12], target: [-0.45, 0.8, -0.3], fov: 54, shift: [0, -0.12] },
      cabin: { space: 'car', inside: true, position: [-0.37, 1.13, 0.15], target: [-0.22, 0.94, -1.8], fov: 84, shift: [0, -0.16] },
      rear: { space: 'car', inside: true, position: [0.02, 1.17, 0.02], target: [0.04, 0.76, 1.05], fov: 86, shift: [0, -0.16] },
      engine: { space: 'car', position: [1.6, 3.2, -4.1], target: [0.0, 0.64, -1.3], fov: 44, shift: [0, -0.2] },
      finale: { space: 'world', position: [0.5, 2.6, 15.5], target: [0, 0.5, 0], fov: 36, shift: [0, -0.2] },
    },
  },
});

/** The portrait framing below this aspect ratio (width / height) */
export const PORTRAIT_BELOW = 0.85;

/** Both arrivals end facing 140°: the studio's lights are laid out about that axis */
export const SHOWROOM_HEADING = 140;
