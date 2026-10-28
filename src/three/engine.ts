// RetroEngine: renders the active scene into a tiny render target and upscales it
// with a post pass (15-bit color + ordered dithering, CRT mask, dissolve fades).

import * as THREE from 'three';
import { globals } from './ps1';
import type { BaseScene } from './scenes/base';
import type { FxEvent, SceneId } from './fx';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uLowRes;
uniform float uFade;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uCrt;
uniform float uTime;
uniform float uLevels;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 uv = vUv;
  if (uCrt > 0.5) {
    vec2 c = uv - 0.5;
    uv = 0.5 + c * (1.0 + 0.045 * dot(c, c));
  }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = floor(uv * uLowRes);
  vec2 suv = (px + 0.5) / uLowRes;
  vec3 col = texture2D(tScene, suv).rgb;
  if (uCrt > 0.5) {
    float off = 0.5 / uLowRes.x;
    col.r = mix(col.r, texture2D(tScene, suv + vec2(off, 0.0)).r, 0.35);
    col.b = mix(col.b, texture2D(tScene, suv - vec2(off, 0.0)).b, 0.35);
  }
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  // 15-bit color with ordered dithering, PS1 style.
  float d = bayer4(px) - 0.5;
  col = floor(col * uLevels + 0.5 + d) / uLevels;

  // Dithered dissolve to black for transitions.
  float b8 = bayer8(px);
  if (b8 < uFade) col = vec3(0.0);

  if (uCrt > 0.5) {
    float row = fract(uv.y * uLowRes.y);
    col *= 0.82 + 0.18 * smoothstep(0.0, 0.5, row) * smoothstep(1.0, 0.5, row) * 2.0;
    vec2 v = vUv - 0.5;
    col *= 1.0 - dot(v, v) * 0.9;
    col *= 0.97 + 0.03 * sin(uTime * 60.0 + uv.y * 3.0);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export type SceneFactory = (id: SceneId) => BaseScene;

export class RetroEngine {
  readonly renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private current: BaseScene | null = null;
  private currentId: SceneId | null = null;
  private pending: SceneId | null = null;
  private transitioning = false;
  private fade = 1;
  private fadeTarget = 0;
  private fadeSpeed = 3;
  private flash = 0;
  private shake = 0;
  private last = performance.now();
  private raf = 0;
  private lowH = 240;
  private jitter = 2;
  private crt = true;
  private reducedMotion = false;
  private onIdleQueue: (() => void)[] = [];
  /** Projection shift in NDC so the hero object isn't hidden behind UI panels. */
  private frame = new THREE.Vector2();
  private frameTarget = new THREE.Vector2();
  private tmp = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    private factory: SceneFactory,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.rt.texture },
        uLowRes: { value: new THREE.Vector2(320, 240) },
        uFade: { value: 1 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uCrt: { value: 1 },
        uTime: { value: 0 },
        uLevels: { value: 31 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(tri, this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  get sceneId() {
    return this.currentId;
  }

  configure(o: { resolution?: number; jitter?: number; crt?: boolean; reducedMotion?: boolean }) {
    if (o.resolution) this.lowH = o.resolution;
    if (o.jitter !== undefined) this.jitter = o.jitter;
    if (o.crt !== undefined) this.crt = o.crt;
    if (o.reducedMotion !== undefined) this.reducedMotion = o.reducedMotion;
    this.resize();
  }

  /** Shift the picture (in NDC, −1…1) to keep the scene's focus clear of UI panels. */
  setFrame(x: number, y: number) {
    this.frameTarget.set(x, y);
  }

  /** Switch worlds with a dithered dissolve. */
  go(id: SceneId) {
    if (id === this.currentId && !this.transitioning) return;
    this.pending = id;
    if (!this.transitioning) this.startTransition();
  }

  private startTransition() {
    this.transitioning = true;
    this.fadeTarget = 1;
    this.fadeSpeed = this.current ? 3.2 : 100;
  }

  private swap() {
    const id = this.pending!;
    this.pending = null;
    this.current?.dispose();
    const next = this.factory(id);
    next.build();
    this.current = next;
    this.currentId = id;
    this.resize();
    next.intro();
    this.fadeTarget = 0;
    this.fadeSpeed = 1.6;
    this.transitioning = false;
    const q = this.onIdleQueue.splice(0);
    q.forEach((fn) => fn());
  }

  /** Run after the pending transition settles (or now). */
  whenReady(fn: () => void) {
    if (this.transitioning || this.pending) this.onIdleQueue.push(fn);
    else fn();
  }

  fx(e: FxEvent) {
    if (e.type === 'flash') {
      this.flash = Math.max(this.flash, e.strength ?? 0.6);
      (this.post.uniforms.uFlashColor.value as THREE.Color).set(e.color ?? '#ffffff');
      return;
    }
    if (e.type === 'shake') {
      if (!this.reducedMotion) this.shake = Math.max(this.shake, e.amount ?? 0.15);
      return;
    }
    this.whenReady(() => this.current?.fx(e));
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    const short = Math.min(w, h);
    const scale = this.lowH / short;
    const lw = Math.max(64, Math.round(w * scale));
    const lh = Math.max(64, Math.round(h * scale));
    this.rt.setSize(lw, lh);
    (this.post.uniforms.uLowRes.value as THREE.Vector2).set(lw, lh);
    globals.uPxScale.value = lh * 0.9;
    const k = this.jitter === 2 ? 0.5 : 1;
    globals.uSnap.value.set((lw / 2) * k, (lh / 2) * k);
    globals.uSnapOn.value = this.jitter > 0 ? 1 : 0;
    if (this.current) {
      const cam = this.current.camera;
      cam.aspect = w / h;
      // Keep the horizontal framing on portrait screens.
      const designAspect = 16 / 9;
      const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.current.baseFov) / 2) * designAspect);
      const vFov = cam.aspect < designAspect ? 2 * Math.atan(Math.tan(hFov / 2) / cam.aspect) : THREE.MathUtils.degToRad(this.current.baseFov);
      cam.fov = Math.min(105, THREE.MathUtils.radToDeg(vFov) * (cam.aspect < 1 ? 0.78 : 1));
      cam.updateProjectionMatrix();
    }
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.fade !== this.fadeTarget) {
      const step = this.fadeSpeed * dt;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
    }
    if (this.transitioning && this.fade >= 1 && this.pending) this.swap();

    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 0.6);

    const sc = this.current;
    globals.uTime.value += dt;
    if (sc) {
      sc.update(dt);
      const cam = sc.camera;
      this.frame.lerp(this.frameTarget, Math.min(1, dt * 4));
      cam.updateProjectionMatrix();
      cam.projectionMatrix.elements[8] += this.frame.x;
      cam.projectionMatrix.elements[9] += this.frame.y;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      const ox = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const oy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      cam.position.x += ox;
      cam.position.y += oy;
      cam.updateMatrixWorld();
      this.applyLights(sc);
      this.renderer.setRenderTarget(this.rt);
      this.renderer.setClearColor(sc.clearColor, 1);
      this.renderer.clear();
      this.renderer.render(sc.scene, cam);
      // undo the shake offset so tweens keep their own pose
      cam.position.x -= ox;
      cam.position.y -= oy;
    } else {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
    const u = this.post.uniforms;
    u.uFade.value = this.fade;
    u.uFlash.value = this.flash;
    u.uCrt.value = this.crt ? 1 : 0;
    u.uTime.value = globals.uTime.value;
    this.renderer.render(this.postScene, this.postCam);
  };

  private applyLights(sc: BaseScene) {
    const view = sc.camera.matrixWorldInverse;
    globals.uAmbient.value.copy(sc.ambient);
    globals.uDirColor.value.copy(sc.dirColor);
    globals.uDirDir.value.copy(sc.dirDir).transformDirection(view);
    globals.uFogColor.value.copy(sc.fogColor);
    globals.uFogNear.value = sc.fogNear;
    globals.uFogFar.value = sc.fogFar;
    for (let i = 0; i < globals.uLightPos.value.length; i++) {
      const slot = sc.lights[i];
      if (!slot) {
        globals.uLightColor.value[i].setRGB(0, 0, 0);
        continue;
      }
      if (slot.follow) slot.follow.getWorldPosition(slot.pos);
      this.tmp.copy(slot.pos).applyMatrix4(view);
      globals.uLightPos.value[i].copy(this.tmp);
      globals.uLightColor.value[i].copy(slot.color).multiplyScalar(sc.lightPower(slot));
      globals.uLightRange.value[i] = slot.range;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.current?.dispose();
    this.renderer.dispose();
  }
}
