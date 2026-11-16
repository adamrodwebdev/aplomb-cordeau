/**
 * The car's engine at the exit, synthesized with the Web Audio API: nothing to download and no
 * licence, loaded only once the visitor turns the sound on. ExitEngine (logic) says what the engine
 * does; this draws the sound of the powertrain the visitor configured.
 *
 * - The Six, a twin-turbo straight-six: the exhaust's pulse train (three firings a turn, two voices
 *   a few cents apart, the crank's half order for the growl), combustion noise pulsed at the firing
 *   rate, a soft saturation driven by the load, the muffler opening with it (wider with the sport
 *   exhaust), the turbos' whistle and whoosh spooling with a lag, and their blow-off on an upshift
 *   under boost. Every frequency that follows the engine speed reads one control, the firing
 *   frequency, so the start's flare and the drive-away are scheduled on it alone.
 * - The E: the motor's whine and its second harmonic, the inverter's faint tone, a soft chord while
 *   it rolls slowly, a short rising tone as it wakes.
 * - Both: the tyres; then the distance (level, air), the car's side (pan), its speed away (Doppler)
 *   and a limiter.
 *
 * Every method takes the audio clock's time (`at`), so a whole drive can be scheduled ahead in an
 * OfflineAudioContext (the tests render it to a file).
 */
import { SeededRandom } from '../time.js';
import { SIX, firingHz } from '../rules/engine.js';
import { clamp, smoothstep } from '../rules/math.js';

const NOISE_SEED = 66;
const SPEED_OF_SOUND = 343;
const REFERENCE = 4; // metres at which the engine plays at its own level
const VOLUME = 0.8;
const DRIVE_AWAY_SHIFT = 4900; // rpm: the drive-away's shift point
const DRIVE_AWAY_PULL = 1500; // rpm a second it gains, pulling away

function noiseBuffer(context, seconds = 2) {
  const random = new SeededRandom(NOISE_SEED);
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = random.range(-1, 1);
  return buffer;
}

/** The exhaust's pulse train: harmonics falling off with a formant ripple, phases spread so it never buzzes */
function exhaustWave(context) {
  const random = new SeededRandom(7);
  const count = 40;
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n += 1) {
    const amplitude = (1 / n ** 0.85) * (1 + 0.35 * Math.cos(n * 0.9));
    const phase = random.range(0, 2 * Math.PI);
    real[n] = amplitude * Math.cos(phase);
    imag[n] = amplitude * Math.sin(phase);
  }
  return context.createPeriodicWave(real, imag);
}

/** A round wave for the crank's half order */
function softWave(context) {
  const count = 8;
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n += 1) imag[n] = 1 / n ** 1.6;
  return context.createPeriodicWave(real, imag);
}

function saturationCurve(amount = 2.2, size = 1024) {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/** A parameter eases towards `value` from `at`, most of the way within `seconds` */
function glide(param, value, at, seconds) {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, Math.max(seconds, 0.005) / 3);
}

/** A parameter starts at `value` at `at` (its earlier schedule dropped from there) */
function hold(param, value, at) {
  param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}

export class EngineSound {
  #context;
  #firing; // the firing frequency (Hz), read by every frequency that follows the engine speed
  #n;
  #sources = [];
  #voice = 'six';
  #sport = false;
  #rpm = SIX.idleRpm;
  #whine = 1;
  #distance = null;
  #heardAt = 0;
  #quietAfter = 0; // the engine is free to follow the car again (the start, a shift)
  #silentAt = 0; // nothing sounds after this (the drive-away or the stop has faded)

  constructor(context, destination = context.destination) {
    this.#context = context;
    const c = context;
    const noise = noiseBuffer(c);
    let noiseStart = 0;
    const gain = (value = 0) => {
      const node = c.createGain();
      node.gain.value = value;
      return node;
    };
    const filter = (type, frequency, Q = 0.7, gainDb = 0) => {
      const node = c.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = Q;
      node.gain.value = gainDb;
      return node;
    };
    const oscillator = (type, frequency) => {
      const node = c.createOscillator();
      if (typeof type === 'string') node.type = type;
      else node.setPeriodicWave(type);
      node.frequency.value = frequency;
      this.#sources.push([node, 0]);
      return node;
    };
    const noiseSource = () => {
      const node = c.createBufferSource();
      node.buffer = noise;
      node.loop = true;
      noiseStart += 0.37; // each its own stretch of the loop: no two voices share their noise
      this.#sources.push([node, noiseStart % 2]);
      return node;
    };

    this.#firing = c.createConstantSource();
    this.#firing.offset.value = firingHz(SIX.idleRpm);
    this.#sources.push([this.#firing, 0]);
    const half = gain(0.5);
    const triple = gain(3);
    this.#firing.connect(half);
    this.#firing.connect(triple);

    // the Six: the exhaust's voices, the growl and the combustion noise, into the saturation
    const six = gain(0);
    const tone = gain(1);
    const wave = exhaustWave(c);
    for (const [detune, level] of [[0, 0.5], [7, 0.35]]) {
      const voice = oscillator(wave, 0);
      voice.detune.value = detune;
      this.#firing.connect(voice.frequency);
      voice.connect(gain(level)).connect(tone);
    }
    const growl = oscillator(softWave(c), 0);
    half.connect(growl.frequency);
    growl.connect(gain(0.22)).connect(tone);
    const chuffBand = filter('bandpass', 0, 0.9);
    triple.connect(chuffBand.frequency);
    const pulse = gain(0.5);
    const pulser = oscillator('sine', 0);
    this.#firing.connect(pulser.frequency);
    pulser.connect(gain(0.5)).connect(pulse.gain);
    noiseSource().connect(chuffBand).connect(pulse).connect(gain(0.6)).connect(tone);
    const starter = oscillator('sawtooth', 170);
    const starterLevel = gain(0);
    starter.connect(filter('lowpass', 900)).connect(starterLevel).connect(six);
    const drive = gain(0.8);
    const shaper = c.createWaveShaper();
    shaper.curve = saturationCurve();
    shaper.oversample = '2x';
    const muffler = filter('lowpass', 900, 0.7);
    const body = filter('peaking', 120, 0.8, 5);
    const pipe = filter('peaking', 480, 1.2, 3);
    const engineLevel = gain(0);
    tone.connect(drive).connect(shaper).connect(muffler).connect(body).connect(pipe).connect(engineLevel).connect(six);
    // the turbos
    const whistle = oscillator('sine', 1800);
    const whistleLevel = gain(0);
    whistle.connect(whistleLevel).connect(six);
    const whooshBand = filter('bandpass', 2500, 3);
    const whooshLevel = gain(0);
    noiseSource().connect(whooshBand).connect(whooshLevel).connect(six);
    const blowLevel = gain(0);
    noiseSource().connect(filter('highpass', 1800)).connect(filter('lowpass', 7000)).connect(blowLevel).connect(six);

    // the E
    const e = gain(0);
    const whine = oscillator('sine', 1);
    const whineLevel = gain(0);
    whine.connect(whineLevel).connect(e);
    const whine2 = oscillator('sine', 2);
    const whine2Level = gain(0);
    whine2.connect(whine2Level).connect(e);
    const inverter = oscillator('sine', 6200);
    const inverterLevel = gain(0);
    inverter.connect(inverterLevel).connect(e);
    const chord = gain(0);
    const chordTone = filter('lowpass', 900);
    chordTone.connect(chord).connect(e);
    for (const hz of [220, 277.18, 329.63]) oscillator('triangle', hz).connect(gain(0.33)).connect(chordTone);
    const ready = oscillator('sine', 330);
    const readyLevel = gain(0);
    ready.connect(readyLevel).connect(e);

    // both: the tyres; then the space and the limiter
    const tyreLevel = gain(0);
    noiseSource().connect(filter('lowpass', 380, 0.6)).connect(tyreLevel);
    const mix = gain(1);
    six.connect(mix);
    e.connect(mix);
    tyreLevel.connect(mix);
    const distance = gain(1);
    const air = filter('lowpass', 16000, 0.5);
    const pan = c.createStereoPanner();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    const master = gain(0);
    mix.connect(distance).connect(air).connect(pan).connect(limiter).connect(master).connect(destination);

    this.#n = { six, e, starterLevel, drive, muffler, pipe, engineLevel, whistle, whistleLevel, whooshBand, whooshLevel,
      blowLevel, whine, whine2, whineLevel, whine2Level, inverterLevel, chord, ready, readyLevel, tyreLevel, distance,
      air, pan, master };
    for (const [node, offset] of this.#sources) {
      if (node.buffer) node.start(0, offset);
      else node.start(0);
    }
  }

  /** The audio clock */
  get now() {
    return this.#context.currentTime;
  }

  /** When the last sound has faded (the drive-away's or the stop's): the page may suspend the audio after */
  get silentAt() {
    return this.#silentAt;
  }

  /** The configured powertrain: `energy` 'six' or 'e'; `exhaust` 'sport' opens the Six's muffler */
  configure({ energy, exhaust }, at) {
    this.#voice = energy === 'e' ? 'e' : 'six';
    this.#sport = exhaust === 'sport';
    hold(this.#n.six.gain, this.#voice === 'six' ? 1 : 0, at);
    hold(this.#n.e.gain, this.#voice === 'e' ? 1 : 0, at);
    hold(this.#n.pipe.gain, this.#sport ? 6 : 3, at);
  }

  /** The engine wakes: the Six cranks, catches, flares and settles to idle; the E gives a short rising tone */
  ignite(at) {
    const n = this.#n;
    const context = this.#context;
    // the page suspends the audio while nothing sounds: the engine wakes it (an offline render never sleeps)
    if (typeof AudioContext === 'function' && context instanceof AudioContext && context.state === 'suspended') context.resume();
    this.#distance = null;
    this.#silentAt = Number.POSITIVE_INFINITY;
    hold(n.master.gain, 0, at);
    n.master.gain.linearRampToValueAtTime(VOLUME, at + 0.03);
    hold(n.distance.gain, 1, at);
    hold(n.air.frequency, 16000, at);
    if (this.#voice === 'six') {
      const firing = this.#firing.offset;
      hold(firing, firingHz(240), at); // the starter turns it over
      firing.linearRampToValueAtTime(firingHz(300), at + 0.34);
      firing.linearRampToValueAtTime(firingHz(1950), at + 0.52); // it catches and flares
      firing.setTargetAtTime(firingHz(SIX.idleRpm), at + 0.55, 0.22); // and settles
      hold(n.starterLevel.gain, 0, at);
      n.starterLevel.gain.linearRampToValueAtTime(0.05, at + 0.04);
      n.starterLevel.gain.linearRampToValueAtTime(0.0001, at + 0.4);
      hold(n.engineLevel.gain, 0.1, at);
      n.engineLevel.gain.linearRampToValueAtTime(0.75, at + 0.5);
      n.engineLevel.gain.setTargetAtTime(0.3, at + 0.56, 0.25);
      hold(n.muffler.frequency, 500, at);
      n.muffler.frequency.linearRampToValueAtTime(2800, at + 0.5);
      n.muffler.frequency.setTargetAtTime(900, at + 0.56, 0.25);
      hold(n.drive.gain, 0.8, at);
      this.#rpm = SIX.idleRpm;
      this.#quietAfter = at + 0.52; // once it has caught, the engine follows the car (its flare settles into it)
    } else {
      hold(n.ready.frequency, 330, at);
      n.ready.frequency.exponentialRampToValueAtTime(660, at + 0.3);
      hold(n.readyLevel.gain, 0, at);
      n.readyLevel.gain.linearRampToValueAtTime(0.12, at + 0.05);
      n.readyLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      this.#quietAfter = at;
    }
  }

  /**
   * This frame: what the engine does (ExitEngine's `rpm`, `load`, `speed` m/s, `whineHz`, `shifted`)
   * and where the car is from the camera (`distance` m, `pan` −1 left to 1 right)
   */
  follow({ rpm, load, speed, whineHz, shifted }, { distance, pan }, at) {
    const n = this.#n;
    const dt = Math.max(at - this.#heardAt, 1 / 240);
    const away = this.#distance === null ? 0 : (distance - this.#distance) / dt;
    this.#distance = distance;
    this.#heardAt = at;
    const doppler = SPEED_OF_SOUND / (SPEED_OF_SOUND + clamp(away, -60, 60));
    glide(n.distance.gain, clamp(REFERENCE / Math.max(distance, 1), 0, 1.6), at, 0.08);
    glide(n.air.frequency, 16000 / (1 + distance / 14), at, 0.1);
    glide(n.pan.pan, clamp(pan, -1, 1), at, 0.08);
    glide(n.tyreLevel.gain, 0.22 * smoothstep(0.3, 25, Math.abs(speed)), at, 0.08);
    if (this.#voice === 'e') {
      const moving = smoothstep(0.2, 3, Math.abs(speed));
      this.#whine = Math.max(whineHz, 1);
      glide(n.whine.frequency, Math.max(whineHz, 1) * doppler, at, 0.05);
      glide(n.whine2.frequency, Math.max(whineHz, 1) * 2 * doppler, at, 0.05);
      glide(n.whineLevel.gain, (0.07 + 0.11 * load) * moving, at, 0.06);
      glide(n.whine2Level.gain, (0.025 + 0.04 * load) * moving, at, 0.06);
      glide(n.inverterLevel.gain, 0.01 * load * moving, at, 0.06);
      glide(n.chord.gain, 0.14 * (1 - smoothstep(3, 9, Math.abs(speed))) * moving, at, 0.2);
      return;
    }
    this.#rpm = rpm;
    const boost = clamp(load * smoothstep(1500, 4500, rpm));
    glide(n.whistleLevel.gain, 0.03 * boost * boost, at, 0.6); // the turbos spool with a lag
    glide(n.whistle.frequency, (1800 + 5200 * boost) * doppler, at, 0.6);
    glide(n.whooshLevel.gain, 0.05 * boost, at, 0.6);
    glide(n.whooshBand.frequency, 2500 + 3000 * boost, at, 0.6);
    if (shifted) this.#upshift(at, boost);
    if (at < this.#quietAfter) return; // the start's flare or a shift is playing out
    const rev = clamp((rpm - SIX.idleRpm) / (SIX.redlineRpm - SIX.idleRpm));
    glide(this.#firing.offset, firingHz(rpm) * doppler, at, 0.06);
    glide(n.engineLevel.gain, (0.3 + 0.55 * load) * (0.6 + 0.4 * rev) * (this.#sport ? 1.25 : 1), at, 0.06);
    glide(n.muffler.frequency, (450 + 2600 * load + 900 * rev) * (this.#sport ? 1.4 : 1), at, 0.06);
    glide(n.drive.gain, 0.6 + 0.9 * load, at, 0.06);
  }

  /** A shift up: the torque cut, the engine speed falls, and the turbos blow off if they were under boost */
  #upshift(at, boost) {
    const n = this.#n;
    hold(n.drive.gain, 0.35, at);
    n.drive.gain.setTargetAtTime(1, at + 0.12, 0.05);
    if (boost > 0.25) {
      hold(n.blowLevel.gain, 0.0001, at);
      n.blowLevel.gain.linearRampToValueAtTime(0.1 * boost, at + 0.02);
      n.blowLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    }
    this.#quietAfter = Math.max(this.#quietAfter, at + 0.14);
  }

  /** The exit is over: the car drives off on its own, pulls through a gear and fades into the distance */
  driveAway(at) {
    const n = this.#n;
    const from = clamp(REFERENCE / Math.max(this.#distance ?? REFERENCE, 1), 0, 1.6);
    hold(n.distance.gain, from, at);
    n.distance.gain.exponentialRampToValueAtTime(REFERENCE / 45, at + 3.2);
    hold(n.air.frequency, 16000 / (1 + (this.#distance ?? REFERENCE) / 14), at);
    n.air.frequency.exponentialRampToValueAtTime(2200, at + 3.2);
    if (this.#voice === 'six') {
      hold(n.engineLevel.gain, 0.6, at);
      n.engineLevel.gain.linearRampToValueAtTime(0.85, at + 0.4);
      hold(n.muffler.frequency, 2400, at);
      n.muffler.frequency.linearRampToValueAtTime(3600 * (this.#sport ? 1.3 : 1), at + 0.5);
      hold(n.drive.gain, 1.4, at);
      glide(n.whistleLevel.gain, 0.02, at, 0.8);
      glide(n.whistle.frequency, 6000 * 0.95, at, 0.8);
      glide(n.whooshLevel.gain, 0.04, at, 0.8);
      // it keeps pulling: up to the shift point, a shift (the next gear's ratio), and again; a touch
      // lower all along as it goes away (Doppler). The shifts come after the levels above: each
      // one's torque cut must not be dropped by them.
      const firing = this.#firing.offset;
      let rpm = Math.max(this.#rpm, 2400);
      let t = at;
      hold(firing, firingHz(rpm) * 0.97, t);
      for (const ratio of [0.64, 0.67]) {
        t += Math.max(0.08, (DRIVE_AWAY_SHIFT - rpm) / DRIVE_AWAY_PULL);
        firing.linearRampToValueAtTime(firingHz(DRIVE_AWAY_SHIFT) * 0.96, t);
        this.#upshift(t, 0.8);
        rpm = DRIVE_AWAY_SHIFT * ratio;
        t += 0.12;
        firing.linearRampToValueAtTime(firingHz(rpm) * 0.955, t);
      }
      firing.linearRampToValueAtTime(firingHz(rpm + DRIVE_AWAY_PULL * 1.4) * 0.94, t + 1.4);
    } else {
      hold(n.whine.frequency, Math.max(this.#whine, 400), at);
      n.whine.frequency.exponentialRampToValueAtTime(2600 * 0.95, at + 2.8);
      hold(n.whine2.frequency, Math.max(this.#whine * 2, 800), at);
      n.whine2.frequency.exponentialRampToValueAtTime(5200 * 0.95, at + 2.8);
      glide(n.whineLevel.gain, 0.16, at, 0.3);
      glide(n.whine2Level.gain, 0.05, at, 0.3);
      glide(n.chord.gain, 0, at, 0.3);
    }
    glide(n.tyreLevel.gain, 0.2, at, 0.3);
    n.master.gain.setTargetAtTime(0, at + 2.6, 0.35);
    this.#quietAfter = at + 4;
    this.#silentAt = at + 4.2;
  }

  /** Back in view after the drive-away began: the engine follows the car again */
  rejoin(at) {
    hold(this.#n.master.gain, VOLUME, at);
    hold(this.#n.blowLevel.gain, 0, at); // the drive-away's shift will not come
    this.#quietAfter = at;
    this.#silentAt = Number.POSITIVE_INFINITY;
  }

  /** The car stands again: the engine winds down and stops */
  stop(at) {
    const n = this.#n;
    hold(this.#firing.offset, firingHz(this.#rpm), at);
    this.#firing.offset.linearRampToValueAtTime(firingHz(250), at + 0.45);
    n.master.gain.cancelScheduledValues(at);
    n.master.gain.setTargetAtTime(0, at + 0.1, 0.12);
    this.#quietAfter = at + 0.8;
    this.#silentAt = at + 0.9;
  }

  dispose() {
    for (const [node] of this.#sources) node.stop();
    this.#n.master.disconnect();
  }
}
