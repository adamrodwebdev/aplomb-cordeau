/**
 * What the cabin's screen shows once the door has welcomed the visitor: on the seamless curved
 * display (the brief of 2026-11-15) the driver's dials on the left (ready, the speed, the version's
 * first figure) and the welcome on the right (the brand, the car as configured). Pass 7's two
 * screens ('driver', 'centre') are drawn the same way. Drawn in 2D on canvases in the page's faces,
 * then laid on the screens by Materials' `screen` layer; redrawn when the configuration changes.
 * Static words only: no clock.
 */
import * as THREE from 'three';

const INK = '#eceef0';
const INK_2 = '#a9afb7';
const BRASS = '#d2a65a';
const DISPLAY = '"Aplomb Estoc", "Estoc Fallback", sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const TEXT = 'Archivo, system-ui, sans-serif';
const WIDE = 1024; // the canvases' width in pixels; their height follows each screen's shape
const WIDEST = 2048; // the seamless display's, 0.83 m wide: its words keep their sharpness

export class CabinScreens {
  #screens = new Map(); // role → { canvas, texture }
  #options = null;

  /**
   * Takes the screens the rig found (`role` → its uniforms and measured size in metres); each gets a
   * canvas of its shape. Fonts that arrive later trigger one more drawing.
   */
  bind(screens) {
    for (const [role, { uniforms, width, height }] of screens) {
      if (this.#screens.has(role)) continue;
      const canvas = document.createElement('canvas');
      canvas.width = role === 'wide' ? WIDEST : WIDE;
      canvas.height = Math.max(64, Math.round((canvas.width * height) / width));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      uniforms.map.value = texture;
      this.#screens.set(role, { canvas, texture });
    }
    document.fonts.load(`500 24px ${MONO}`).then(() => this.#redraw()).catch(() => {});
    this.#redraw();
  }

  /** The configuration's options (resolved), as the screens should read them */
  draw(options) {
    this.#options = options;
    this.#redraw();
  }

  #redraw() {
    if (!this.#options) return;
    for (const [role, { canvas, texture }] of this.#screens) {
      const ctx = canvas.getContext('2d');
      if (role === 'driver') driver(ctx, canvas, this.#options);
      else if (role === 'wide') wide(ctx, canvas, this.#options);
      else centre(ctx, canvas, this.#options);
      texture.needsUpdate = true;
    }
  }
}

function backdrop(ctx, { width, height }) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#0b0e12');
  g.addColorStop(1, '#040506');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

/** The seamless display: the dials on its left 46 %, a dark gutter, the welcome on the right */
function wide(ctx, canvas, options) {
  const { width: w, height: h } = canvas;
  backdrop(ctx, canvas);
  const split = Math.round(w * 0.46);
  const gap = Math.round(w * 0.02);
  for (const [x, width, draw] of [[0, split, driver], [split + gap, w - split - gap, centre]]) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.beginPath();
    ctx.rect(0, 0, width, h);
    ctx.clip();
    draw(ctx, { width, height: h }, options);
    ctx.restore();
  }
}

/** Ready, the speed in the face's calm end, the version's first figure on the right */
function driver(ctx, canvas, options) {
  const { width: w, height: h } = canvas;
  backdrop(ctx, canvas);
  const u = h / 100; // one hundredth of the screen's height
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BRASS;
  ctx.font = `500 ${Math.round(9 * u)}px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('READY', w * 0.06, h * 0.34);
  ctx.fillStyle = INK_2;
  ctx.font = `400 ${Math.round(10 * u)}px ${TEXT}`;
  ctx.fillText(`${options.energy.label} · ${options.version.id}`, w * 0.06, h * 0.52);
  ctx.fillStyle = INK;
  ctx.font = `400 ${Math.round(26 * u)}px ${DISPLAY}`;
  ctx.fillText('P', w * 0.06, h * 0.86);

  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.round(52 * u)}px ${DISPLAY}`;
  ctx.fillText('0', w * 0.5, h * 0.66);
  ctx.fillStyle = INK_2;
  ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
  ctx.fillText('KM/H', w * 0.5, h * 0.82);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = Math.max(2, u * 0.8);
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.9);
  ctx.lineTo(w * 0.6, h * 0.9);
  ctx.stroke();

  const [value, unit] = options.version.figures[0];
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `400 ${Math.round(22 * u)}px ${DISPLAY}`;
  ctx.fillText(value, w * 0.94, h * 0.62);
  ctx.fillStyle = INK_2;
  ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
  ctx.fillText(unit.toUpperCase(), w * 0.94, h * 0.8);
}

/** The welcome: the brand, the car as the visitor made it, a calm row of the screen's sections */
function centre(ctx, canvas, options) {
  const { width: w, height: h } = canvas;
  backdrop(ctx, canvas);
  const u = h / 100;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK_2;
  ctx.font = `400 ${Math.round(6 * u)}px ${TEXT}`;
  ctx.fillText('21.0 °C', w * 0.05, h * 0.12);
  ctx.textAlign = 'right';
  ctx.fillText('AUTO', w * 0.95, h * 0.12);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `400 ${Math.round(15 * u)}px ${DISPLAY}`;
  ctx.fillText('APLOMB', w * 0.5, h * 0.46);
  ctx.fillStyle = INK_2;
  ctx.font = `400 ${Math.round(7 * u)}px ${TEXT}`;
  ctx.fillText(`${options.energy.label} ${options.version.id}`, w * 0.5, h * 0.6);
  ctx.fillStyle = BRASS;
  ctx.font = `500 ${Math.round(5 * u)}px ${MONO}`;
  ctx.fillText(`${options.paint.label} · ${options.trim.label} · ${options.inlay.label}`.toUpperCase(), w * 0.5, h * 0.7);

  const sections = ['DRIVE', 'CLIMATE', 'AUDIO', 'CAR'];
  ctx.font = `500 ${Math.round(5 * u)}px ${MONO}`;
  sections.forEach((label, i) => {
    ctx.fillStyle = i === 0 ? BRASS : INK_2;
    ctx.fillText(label, w * (0.2 + i * 0.2), h * 0.92);
  });
}
