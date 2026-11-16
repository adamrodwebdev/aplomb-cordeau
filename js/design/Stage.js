/** The renderer, the camera and its framing; the canvas is transparent over the page's plates. */
import * as THREE from 'three';

export class Stage {
  #renderer;
  #scene = new THREE.Scene();
  #camera = new THREE.PerspectiveCamera(30, 1, 0.1, 160);
  #dprCap;
  #width = 1;
  #height = 1;
  #shift = [0, 0];

  constructor(canvas, dprCap) {
    this.#dprCap = dprCap;
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.toneMapping = THREE.AgXToneMapping;
    this.#renderer.toneMappingExposure = 1.08;
    this.#renderer.autoClear = false;
    this.#renderer.info.autoReset = false; // one frame draws several passes: count them together
  }

  get renderer() {
    return this.#renderer;
  }

  get scene() {
    return this.#scene;
  }

  get camera() {
    return this.#camera;
  }

  get aspect() {
    return this.#width / this.#height;
  }

  get pixels() {
    const ratio = this.#renderer.getPixelRatio();
    return { width: Math.round(this.#width * ratio), height: Math.round(this.#height * ratio) };
  }

  resize(width, height) {
    this.#width = Math.max(1, width);
    this.#height = Math.max(1, height);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.#dprCap));
    this.#renderer.setSize(this.#width, this.#height, false);
    this.#camera.aspect = this.aspect;
    this.#applyShift();
  }

  /** Frames the camera; `pullBack` scales its distance for narrow screens */
  frame({ position, target, fov, shift }, pullBack) {
    const [tx, ty, tz] = target;
    const [px, py, pz] = position;
    this.#camera.position.set(tx + (px - tx) * pullBack, ty + (py - ty) * pullBack, tz + (pz - tz) * pullBack);
    this.#camera.fov = fov;
    this.#camera.lookAt(tx, ty, tz);
    this.#shift = shift;
    this.#applyShift();
  }

  /** Where the ground's horizon falls, as a fraction of the screen height from the top */
  horizon() {
    const camera = this.#camera;
    camera.updateMatrixWorld();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return 0.4;
    forward.normalize().multiplyScalar(2000);
    const far = camera.position.clone().add(forward);
    far.y = 0;
    far.project(camera);
    return THREE.MathUtils.clamp((1 - far.y) / 2, 0, 1);
  }

  clear() {
    this.#renderer.info.reset();
    this.#renderer.setRenderTarget(null);
    this.#renderer.clear();
  }

  render(scene = this.#scene, camera = this.#camera) {
    this.#renderer.render(scene, camera);
  }

  #applyShift() {
    const [sx, sy] = this.#shift;
    const w = this.#width;
    const h = this.#height;
    this.#camera.setViewOffset(w, h, -sx * w, -sy * h, w, h);
    this.#camera.updateProjectionMatrix();
  }
}
