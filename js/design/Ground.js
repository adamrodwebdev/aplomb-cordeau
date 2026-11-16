/** What the car leaves on the ground: a soft contact shadow, and its traces through the water. */
import * as THREE from 'three';
import { placeOnTrace } from '../rules/drift.js';

/**
 * The car's contact shadow, baked in Blender as ambient occlusion on a plate under it (white =
 * shadow, soft and dark where the tyres touch). It follows the car; no shadow map to compute.
 */
export class ContactShadow {
  #mesh;

  constructor(plate, [width, length]) {
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: plate, transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false });
    this.#mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
    this.#mesh.rotation.x = -Math.PI / 2;
    this.#mesh.position.y = 0.004;
    this.#mesh.renderOrder = 2;
  }

  get object() {
    return this.#mesh;
  }
}

/**
 * Where the rear tyres pushed the water aside, painted into a mask laid on the road (the wet
 * road reads it: no reflection there, damp asphalt, a bright rim). For a stretch, each trace turns
 * into a line of the headline, written letter by letter as the tyre passes. Painted only the first
 * time the drift passes, so the traces stay for the rest of the visit: the visitor's own trace.
 */
export class WetTraces {
  #canvas;
  #ctx;
  #texture;
  #centre;
  #size;
  #traces;
  #words;
  #written;
  #font;
  #minSlip;
  #trace;
  #reach = 0;

  /**
   * `traces`: both tyres' samples (rules/drift.js traceSamples); `title`: ROAD_TITLE; `font`:
   * { family, weight, capRatio } (cap height over the em)
   */
  constructor({ centre, size }, [pixelsWide, pixelsHigh], traces, title, font, minSlip) {
    this.#centre = centre;
    this.#size = size;
    this.#traces = traces;
    this.#minSlip = minSlip;
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = pixelsWide;
    this.#canvas.height = pixelsHigh;
    this.#ctx = this.#canvas.getContext('2d');
    this.#ctx.lineCap = 'round';
    this.#ctx.lineJoin = 'round';
    this.#texture = new THREE.CanvasTexture(this.#canvas);
    this.#texture.colorSpace = THREE.NoColorSpace; // a mask, not a colour
    this.#texture.flipY = false; // the canvas's first row lies at the rect's smallest z
    this.#texture.anisotropy = 8;
    this.#trace = title.trace;
    const perMetre = pixelsWide / size[0];
    const em = (title.capHeight / font.capRatio) * perMetre;
    this.#font = `${font.weight} ${em.toFixed(1)}px ${font.family}`;
    this.#ctx.font = this.#font;
    // the first line goes to the trace further from the camera (it looks down -Z)
    const depth = traces.map((trace) => {
      const start = trace.find((p) => p.slip >= minSlip) ?? trace[0];
      return start.z;
    });
    const order = depth[0] <= depth[1] ? [0, 1] : [1, 0];
    this.#words = [null, null];
    order.forEach((wheel, line) => {
      const text = title.lines[line];
      const chars = [...text];
      const advances = chars.map((ch) => (this.#ctx.measureText(ch).width + title.tracking * title.capHeight * perMetre) / perMetre);
      this.#words[wheel] = { chars, ...placeOnTrace(traces[wheel], advances, title.startAt, minSlip) };
    });
    this.#written = this.#words.map((word) => word.chars.map(() => false));
  }

  get texture() {
    return this.#texture;
  }

  /** The mask's place on the road: centre x, z and size, metres */
  get rect() {
    return [this.#centre[0], this.#centre[1], this.#size[0], this.#size[1]];
  }

  /** Paints what the drift has added since last time, up to its progress `u` */
  extendTo(u) {
    if (u <= this.#reach + 0.0005) return;
    const ctx = this.#ctx;
    const width = (this.#trace / this.#size[0]) * this.#canvas.width;
    this.#traces.forEach((trace, w) => {
      const word = this.#words[w];
      for (let i = 1; i < trace.length; i += 1) {
        const a = trace[i - 1];
        const b = trace[i];
        if (a.u < this.#reach || b.u > u) continue;
        if (b.slip < this.#minSlip) continue;
        // the words stand in for the trace, with a breath before the first letter and a longer one
        // on the full stop's side (a trace touching it drew an exclamation mark); read against the
        // travel, the full stop is written first
        const [before, after] = word.reversed ? [0.8, 0.3] : [0.3, 0.8];
        if (b.s > word.from - before && a.s < word.to + after) continue;
        const grip = Math.min(1, Math.max(0, (b.slip - this.#minSlip) / 18));
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + 0.45 * grip})`;
        ctx.lineWidth = width * (0.8 + 0.2 * grip);
        const p = this.#pixel(a);
        const q = this.#pixel(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.font = this.#font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      word.glyphs.forEach((glyph, k) => {
        if (this.#written[w][k] || glyph.u > u || word.chars[k] === ' ') return;
        this.#written[w][k] = true;
        const at = this.#pixel(glyph);
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(glyph.angle);
        ctx.fillText(word.chars[k], 0, 0);
        ctx.restore();
      });
    });
    this.#reach = u;
    this.#texture.needsUpdate = true;
  }

  dispose() {
    this.#texture.dispose();
  }

  #pixel({ x, z }) {
    const [cx, cz] = this.#centre;
    const [w, h] = this.#size;
    return {
      x: ((x - cx + w / 2) / w) * this.#canvas.width,
      y: ((z - cz + h / 2) / h) * this.#canvas.height,
    };
  }
}
