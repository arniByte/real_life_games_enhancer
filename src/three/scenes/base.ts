import * as THREE from 'three';
import { MAX_LIGHTS, Particles } from '../ps1';
import { flickerFlames } from '../models';
import type { FxEvent, SceneEvent } from '../fx';

export interface LightSlot {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range: number;
  /** 0 = steady, 1 = torch-like flicker. */
  flicker?: number;
  /** Follow an object (e.g. a swinging lantern). */
  follow?: THREE.Object3D;
}

interface Tween {
  t: number;
  dur: number;
  fn: (k: number) => void;
  ease: (k: number) => number;
  done?: () => void;
}

export const ease = {
  linear: (k: number) => k,
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2),
  outQuart: (k: number) => 1 - Math.pow(1 - k, 4),
  outQuint: (k: number) => 1 - Math.pow(1 - k, 5),
};

export abstract class BaseScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 300);
  /** Horizontal-ish field of view the scene was designed for (at 16:9). */
  baseFov = 60;
  readonly lights: LightSlot[] = [];
  readonly particles = new Particles(500);
  ambient = new THREE.Color(0.1, 0.08, 0.12);
  dirColor = new THREE.Color(0, 0, 0);
  dirDir = new THREE.Vector3(0.3, -1, -0.4).normalize();
  fogColor = new THREE.Color(0.03, 0.02, 0.05);
  fogNear = 6;
  fogFar = 30;
  clearColor = new THREE.Color(0, 0, 0);
  time = 0;
  /** Camera look-at target (scenes animate this together with camera.position). */
  readonly look = new THREE.Vector3();
  /** Small idle sway applied on top of the camera pose. */
  sway = 0.04;
  /** How far the view drifts toward the mouse (world units at the look target). */
  parallax = 0.25;
  /** Mouse position in NDC, smoothed (set by the engine). */
  readonly mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();
  /** Send an event to the UI (wired by the engine). */
  emit: (e: SceneEvent) => void = () => {};
  protected raycaster = new THREE.Raycaster();
  private tweens: Tween[] = [];

  constructor() {
    this.scene.add(this.particles.points);
  }

  abstract build(): void;

  /** Per-frame scene logic. */
  protected tick(_dt: number) {}

  /** React to UI events. */
  fx(_e: FxEvent) {}

  /** Play the entrance flight. */
  intro() {}

  /** Pointer input forwarded from the UI layer (NDC coordinates). */
  onPointer(_type: 'down' | 'move' | 'up', _ndc: THREE.Vector2) {}

  setMouse(x: number, y: number) {
    this.mouseTarget.set(x, y);
  }

  /** Raycast helper against a list of objects. */
  protected hit(ndc: THREE.Vector2, objects: THREE.Object3D[]): THREE.Intersection | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  addLight(slot: LightSlot): LightSlot {
    if (this.lights.length < MAX_LIGHTS) this.lights.push(slot);
    return slot;
  }

  animate(dur: number, fn: (k: number) => void, e: (k: number) => number = ease.inOutCubic): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ t: 0, dur: Math.max(0.0001, dur), fn, ease: e, done: resolve });
    });
  }

  private camToken = 0;

  /** Fly the camera to a pose. A newer flight cancels the previous one (its promise never resolves). */
  flyTo(pos: THREE.Vector3, look: THREE.Vector3, dur: number, e = ease.inOutCubic): Promise<void> {
    const token = ++this.camToken;
    const p0 = this.camera.position.clone();
    const l0 = this.look.clone();
    return new Promise((resolve) => {
      this.animate(
        dur,
        (k) => {
          if (token !== this.camToken) return;
          this.camera.position.lerpVectors(p0, pos, k);
          this.look.lerpVectors(l0, look, k);
        },
        e,
      ).then(() => {
        if (token === this.camToken) resolve();
      });
    });
  }

  update(dt: number) {
    this.time += dt;
    for (const tw of this.tweens.slice()) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    this.tick(dt);
    this.particles.update(dt);
    flickerFlames(this.scene, this.time);
    this.mouse.lerp(this.mouseTarget, Math.min(1, dt * 3));
    const swayX = Math.sin(this.time * 0.4) * this.sway + this.mouse.x * this.parallax;
    const swayY = Math.sin(this.time * 0.53 + 1) * this.sway * 0.6 + this.mouse.y * this.parallax * 0.6;
    this.camera.lookAt(this.look.x + swayX, this.look.y + swayY, this.look.z);
  }

  /** Light intensity this frame (with flicker). */
  lightPower(slot: LightSlot): number {
    if (!slot.flicker) return slot.intensity;
    const t = this.time;
    const n = Math.sin(t * 11.3 + slot.pos.x * 3) * 0.5 + Math.sin(t * 23.7 + slot.pos.z) * 0.3 + Math.sin(t * 5.1) * 0.2;
    return slot.intensity * (1 + n * 0.18 * slot.flicker);
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
  }
}
