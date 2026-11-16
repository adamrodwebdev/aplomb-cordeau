/**
 * The halo of lit lamps, which a camera always records and a plain emissive surface lacks: a line
 * of soft additive points along each blade, strip, LED eye and the rear bar, just proud of the lens.
 * One `Points` cloud per lamp (one draw call), spaced well under the glow's size so the points melt
 * into one continuous line, as an LED light guide reads; the first version strung a few dozen
 * sprites and read as twinkling beads. The body hides them where it should (depth tested); they dim
 * with the lights.
 */
import * as THREE from 'three';

const LAMPS = [
  // the pass-7 master's names: pattern, colour, glow across (m), points per metre of lamp, outward
  // direction (front is -Z)
  [/^MDL_drl_guide_[LR]$/, 0xfff0dc, 0.034, 160, -1],
  [/^MDL_headlamp_guide_[LR]$/, 0xfff3e4, 0.026, 160, -1],
  [/^MDL_projector_led_[LR]\d$/, 0xffffff, 0.036, 0, -1], // the LEDs, not their chrome cups or lenses: one each
  [/^MDL_taillamp_leds$/, 0xff2418, 0.045, 130, 1],
];
const LEVEL = 0.09; // each point's opacity at full lights: about five overlap at any spot
// PointsMaterial sizes a point as `size` × half the canvas height ÷ depth, a sprite as its world
// size over the whole frustum: × 1 / tan(fov / 2) turns a glow's width in metres into `size`
const TO_POINT_SIZE = 1 / Math.tan((30 / 2) * (Math.PI / 180));

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The lamp's centre line in its parent's frame (metres), 2 cm proud of the outward faces: their
 * vertices sorted along the lamp, averaged in a running window, then measured by arc length. The
 * vertices sit on the rings of a swept tube, so picking vertices directly bunched the glow into
 * beads; the GLB is quantized, so lengths are read after the node's transform, never in the
 * geometry's own units.
 */
function centreline(mesh, outward) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  if (!position || !normal) return { length: 0 };
  const points = [];
  const box = new THREE.Box3();
  for (let i = 0; i < position.count; i += 1) {
    const n = new THREE.Vector3().fromBufferAttribute(normal, i).transformDirection(mesh.matrix);
    if (n.z * outward <= 0.2) continue; // the lens's outer face only: the pieces are 3 mm shells
    const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    points.push({ p, n });
    box.expandByPoint(p);
  }
  if (points.length === 0) return { length: 0 };
  const extent = box.getSize(new THREE.Vector3());
  const axis = extent.x >= extent.y && extent.x >= extent.z ? 'x' : extent.y >= extent.z ? 'y' : 'z';
  points.sort((a, b) => a.p[axis] - b.p[axis]);
  const run = Math.max(1, Math.min(26, Math.floor(points.length / 3)));
  const line = [];
  for (let s = 0; s + run <= points.length; s += Math.max(1, Math.floor(run / 3))) {
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let j = s; j < s + run; j += 1) {
      p.add(points[j].p);
      n.add(points[j].n);
    }
    line.push(p.divideScalar(run).add(n.normalize().multiplyScalar(0.02)));
  }
  const lengths = [0];
  for (let i = 1; i < line.length; i += 1) lengths.push(lengths[i - 1] + line[i].distanceTo(line[i - 1]));
  const total = lengths[lengths.length - 1];
  return {
    length: line.length,
    total,
    sample(t, target) {
      if (line.length === 1 || total === 0) return target.copy(line[0]);
      const d = t * total;
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < d) i += 1;
      const span = lengths[i] - lengths[i - 1] || 1;
      return target.lerpVectors(line[i - 1], line[i], (d - lengths[i - 1]) / span);
    },
  };
}

export class LampGlow {
  #materials = [];

  constructor(meshes) {
    const texture = glowTexture();
    for (const mesh of meshes) {
      for (const [pattern, colour, size, density, outward] of LAMPS) {
        if (pattern.test(mesh.name)) this.#line(mesh, { texture, colour, size, density, outward });
      }
    }
  }

  /** 0 to 1, with the car's lights */
  setLevel(level) {
    for (const material of this.#materials) material.opacity = LEVEL * level;
  }

  #line(mesh, { texture, colour, size, density, outward }) {
    const path = centreline(mesh, outward);
    if (path.length === 0) return;
    const count = density > 0 ? Math.max(2, Math.round(path.total * density)) : 1;
    const points = new Float32Array(count * 3);
    const at = new THREE.Vector3();
    for (let k = 0; k < count; k += 1) {
      path.sample(count === 1 ? 0.5 : (k + 0.5) / count, at);
      at.toArray(points, k * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const material = new THREE.PointsMaterial({
      map: texture,
      color: colour,
      size: size * TO_POINT_SIZE,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    });
    this.#materials.push(material);
    const cloud = new THREE.Points(geometry, material);
    cloud.name = `${mesh.name}-glow`;
    cloud.renderOrder = 12;
    mesh.parent.add(cloud);
  }
}
