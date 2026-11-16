/**
 * The light the paint reflects: the road at dawn and the studio, then the tonal arc's other lights
 * (their scenes: EnvironmentScenes). Car paint is a mirror: it looks real only when what it mirrors
 * has structure. The first screen's two are read with the scene's boot; the arc's follow in the
 * background (`more`), and the night studio's stands in for any not there yet.
 *
 * Both maps are drawn once, off the page, by `tools/bake-environments.mjs`, and read here from two
 * files. Drawn in the page, PMREM compiled its blur programs on the main thread: one task of about
 * 0.5 s, 2 s on Lighthouse's phone, 94 % of its blocking time (2026-11-16).
 *
 * A file is an opaque RGB PNG of 768 × 2048: three r186's cube-UV layout (768 × 1024, the six faces
 * and their blurred levels) in RGBE, the mantissas in the top half, the shared exponent (grey) in the
 * bottom half, rows in the target's order. Opaque, so that no browser multiplies an alpha into the
 * values. One small pass decodes it on the GPU into the half-float target the materials sample, as
 * PMREM's own would be. A three.js upgrade can change that layout (r187's PMREM is a cube map with
 * mip levels): bake the files again.
 */
import * as THREE from 'three';
import { nextTask } from '../time.js';

/** The low sun's direction at dawn, behind the car on the left (the road's key light uses it too) */
export const DAWN_SUN = new THREE.Vector3(-0.62, 0.075, -0.78).normalize();
/** Dusk's, opposite: the finale's key light uses it too */
export const DUSK_SUN = new THREE.Vector3(0.62, 0.06, 0.78).normalize();

/** Every light the paint can reflect, in the order they are baked and read */
export const ENVIRONMENTS = Object.freeze(['road', 'showroom', 'studio-white', 'workshop', 'night', 'dusk']);
/** The first screen's, read with the scene's boot */
const FIRST = Object.freeze(['road', 'showroom']);

const WIDTH = 768;
const HEIGHT = 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // each file is read at the door: size, signature, header
const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = 0x49484452;

const DECODE_VERTEX = /* glsl */ `
  in vec3 position;
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// a value is (mantissa + 0.5) / 256 × 2^(exponent − 128); a mantissa of 0 stays 0, an exponent of 0 is black
const DECODE_FRAGMENT = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform highp sampler2D tRGBE;
  out vec4 colour;
  void main() {
    ivec2 at = ivec2(gl_FragCoord.xy);
    vec3 mantissa = floor(texelFetch(tRGBE, at, 0).rgb * 255.0 + 0.5);
    float exponent = floor(texelFetch(tRGBE, at + ivec2(0, ${HEIGHT}), 0).r * 255.0 + 0.5);
    vec3 value = exponent < 0.5 ? vec3(0.0) : (mantissa + 0.5) / 256.0 * exp2(exponent - 128.0);
    colour = vec4(value * step(0.5, mantissa), 1.0);
  }
`;

/** Reads one file at the door (its size, the PNG signature, then a 768 × 2048 8-bit RGB header) into a bitmap */
async function readFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`environment: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('environment: too large');
  if (bytes.byteLength < 33 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) throw new Error('environment: not a PNG');
  const header = new DataView(bytes.buffer, 8, 25);
  const [depth, colourType, compression, filter, interlace] = bytes.subarray(24, 29);
  const expected = header.getUint32(0) === 13 && header.getUint32(4) === IHDR
    && header.getUint32(8) === WIDTH && header.getUint32(12) === 2 * HEIGHT
    && depth === 8 && colourType === 2 && compression === 0 && filter === 0 && interlace === 0;
  if (!expected) throw new Error('environment: not the expected picture');
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/** A target like PMREM's (no depth buffer: nothing is drawn in depth) */
function cubeUVTarget() {
  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });
  target.texture.mapping = THREE.CubeUVReflectionMapping;
  target.texture.name = 'PMREM.cubeUv';
  return target;
}

/** The pass that turns a file's RGBE picture into the half-float cube-UV target the materials sample */
class CubeUVDecoder {
  #renderer;
  #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  #mesh;

  constructor(renderer) {
    this.#renderer = renderer;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DECODE_VERTEX,
      fragmentShader: DECODE_FRAGMENT,
      uniforms: { tRGBE: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.#mesh = new THREE.Mesh(geometry, material);
    this.#mesh.frustumCulled = false;
  }

  /** Compiles the pass in parallel where the browser can (KHR_parallel_shader_compile), bound as it will draw */
  async compile() {
    const renderer = this.#renderer;
    const target = cubeUVTarget();
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const compiled = renderer.compileAsync(this.#mesh, this.#camera);
    renderer.setRenderTarget(previous);
    await compiled;
    target.dispose();
  }

  /** Draws a file's bitmap into a new cube-UV target and returns the target; the bitmap is closed */
  decode(bitmap) {
    const renderer = this.#renderer;
    const source = new THREE.Texture(bitmap);
    source.flipY = false;
    source.generateMipmaps = false;
    source.minFilter = THREE.NearestFilter;
    source.magFilter = THREE.NearestFilter;
    source.colorSpace = THREE.NoColorSpace;
    source.premultiplyAlpha = false;
    source.needsUpdate = true;
    const target = cubeUVTarget();
    const { uniforms } = this.#mesh.material;
    uniforms.tRGBE.value = source;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(this.#mesh, this.#camera);
    renderer.setRenderTarget(previous);
    uniforms.tRGBE.value = null;
    source.dispose();
    bitmap.close();
    return target;
  }

  dispose() {
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }
}

export class Environments {
  #maps;
  #renderer;
  #files;
  #coming = null;

  constructor(maps, renderer, files) {
    this.#maps = maps;
    this.#renderer = renderer;
    this.#files = files;
  }

  /**
   * The first screen's maps from their files (`files`: name → URL). If a file cannot be read, they are
   * drawn here instead: the same light, with the slow start the files avoid.
   */
  static async load(renderer, files) {
    const textures = (targets) => new Map([...targets].map(([name, target]) => [name, target.texture]));
    try {
      return new Environments(textures(await Environments.read(renderer, files, FIRST)), renderer, files);
    } catch (error) {
      console.warn('[drift] the environment files could not be read: drawn in the page instead.', error);
      const { drawEnvironments } = await import('./EnvironmentScenes.js');
      return new Environments(textures(drawEnvironments(renderer, {}, FIRST)), renderer, null);
    }
  }

  /** Reads and decodes the files of `names`, one a task: name → render target (the bake tool's check reads them back) */
  static async read(renderer, files, names = ENVIRONMENTS) {
    const bitmaps = await Promise.all(names.map((name) => readFile(files[name])));
    const decoder = new CubeUVDecoder(renderer);
    await decoder.compile();
    const targets = new Map();
    for (const [i, name] of names.entries()) {
      await nextTask();
      targets.set(name, decoder.decode(bitmaps[i]));
    }
    decoder.dispose();
    return targets;
  }

  /** The tonal arc's other lights, read in the background once; those that fail leave the night studio's */
  more() {
    this.#coming ??= this.#readMore();
    return this.#coming;
  }

  async #readMore() {
    const names = ENVIRONMENTS.filter((name) => !this.#maps.has(name));
    if (!this.#files || !names.length) return;
    try {
      for (const [name, target] of await Environments.read(this.#renderer, this.#files, names)) this.#maps.set(name, target.texture);
    } catch (error) {
      console.warn("[drift] the tonal arc's environments could not be read: the night studio stands in.", error);
    }
  }

  /** A light's map, or null while it is not there */
  for(name) {
    return this.#maps.get(name) ?? null;
  }
}
