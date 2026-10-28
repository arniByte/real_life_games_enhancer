// The Shrine of Fates: a chapel with the Wheel of Fortune. The wheel's sectors are
// drawn from the real odds of the visiting player — what you see is what you roll.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { candle, hoodedFigure, wall } from '../models';
import type { FxEvent } from '../fx';

const WHEEL_POS = new THREE.Vector3(0, 3.1, -2.6);
const WHEEL_R = 2.1;

export class ShrineScene extends BaseScene {
  private wheel = new THREE.Group();
  private wheelCanvas = T.makeCanvas(256, 256);
  private wheelTex = T.toTexture(this.wheelCanvas, false);
  private bounds: number[] = [];
  private spinning: { from: number; to: number; t: number; dur: number; onTick?: () => void; onDone?: () => void; last: number } | null = null;
  private pointer!: THREE.Mesh;
  private redLight!: { color: THREE.Color; intensity: number };

  build() {
    this.baseFov = 55;
    this.ambient.setRGB(0.11, 0.07, 0.1);
    this.fogColor.setRGB(0.05, 0.015, 0.03);
    this.fogNear = 5;
    this.fogFar = 18;
    this.clearColor.copy(this.fogColor);

    const fl = new THREE.Mesh(new THREE.PlaneGeometry(14, 14, 10, 10), ps1({ map: T.flagstone(), uvScale: [5, 5] }));
    fl.rotation.x = -Math.PI / 2;
    this.scene.add(fl);
    const brick = ps1({ map: T.stoneBricks(), uvScale: [5, 3] });
    const back = wall(14, 8, brick, 8, 4);
    back.position.set(0, 4, -5);
    this.scene.add(back);
    for (const side of [-1, 1]) {
      const w = wall(12, 8, brick, 8, 4);
      w.position.set(side * 6, 4, 0);
      w.rotation.y = -side * Math.PI / 2;
      this.scene.add(w);
    }
    // Rose window glow behind the wheel
    const glow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 16), ps1({ color: 0x4a1030, unlit: true, fog: 0.3 }));
    glow.position.set(WHEEL_POS.x, WHEEL_POS.y, -4.95);
    this.scene.add(glow);

    // The Wheel
    const face = new THREE.Mesh(new THREE.CircleGeometry(WHEEL_R, 48), ps1({ map: this.wheelTex, unlit: true, color: 0xd8d0c8, fog: 0.4 }));
    this.wheel.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.05, 0.12, 4, 32), ps1({ map: T.gold(), emissive: 0x221100 }));
    this.wheel.add(rim);
    for (let i = 0; i < 8; i++) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.45, 5), ps1({ map: T.woodPlanks(true) }));
      const a = (i / 8) * Math.PI * 2;
      handle.position.set(Math.cos(a) * (WHEEL_R + 0.35), Math.sin(a) * (WHEEL_R + 0.35), 0);
      handle.rotation.z = a - Math.PI / 2;
      this.wheel.add(handle);
    }
    this.wheel.position.copy(WHEEL_POS);
    this.scene.add(this.wheel);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 6), ps1({ map: T.metal() }));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(WHEEL_POS.x, WHEEL_POS.y, -3);
    this.scene.add(axle);
    this.pointer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), ps1({ map: T.gold(), emissive: 0x332200 }));
    this.pointer.rotation.z = Math.PI;
    this.pointer.position.set(WHEEL_POS.x, WHEEL_POS.y + WHEEL_R + 0.28, WHEEL_POS.z + 0.2);
    this.scene.add(this.pointer);

    // Guardians holding the wheel
    for (const side of [-1, 1]) {
      const g = hoodedFigure(0x2a1c22, side < 0 ? 0x8ff0ff : 0xff3040);
      g.scale.setScalar(1.6);
      g.position.set(side * 3.6, 0, -3.2);
      g.rotation.y = -side * 0.35;
      this.scene.add(g);
    }

    // Altar with candles
    const altarMat = ps1({ map: T.darkMarble(), uvScale: [2, 1] });
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 1.2), altarMat);
    altar.position.set(0, 0.5, 0.2);
    this.scene.add(altar);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.04, 1.3), ps1({ map: T.felt('red') }));
    cloth.position.set(0, 1.02, 0.2);
    this.scene.add(cloth);
    for (let i = 0; i < 7; i++) {
      const c = candle(0.25 + Math.random() * 0.35, 0.06);
      c.group.position.set(-1.5 + i * 0.5, 1.04, 0.1 + (i % 2) * 0.3);
      this.scene.add(c.group);
    }
    const chalice = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, 0], [0.18, 0], [0.04, 0.06], [0.04, 0.25], [0.2, 0.35], [0.22, 0.5], [0.18, 0.5], [0, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)),
        8,
      ),
      ps1({ map: T.gold() }),
    );
    chalice.position.set(0, 1.04, 0.35);
    this.scene.add(chalice);
    for (let i = 0; i < 16; i++) {
      const c = candle(0.2 + Math.random() * 0.5, 0.07);
      const a = Math.PI + (i / 15) * Math.PI;
      c.group.position.set(Math.cos(a) * 5 * 0.9, 0, -2.5 + Math.sin(a) * -1.8 - 1);
      this.scene.add(c.group);
    }

    this.redLight = this.addLight({ pos: new THREE.Vector3(0, 3, 0.5), color: new THREE.Color(1, 0.3, 0.35), intensity: 1.3, range: 8, flicker: 0.3 });
    this.addLight({ pos: new THREE.Vector3(0, 1.6, 0.6), color: new THREE.Color(1, 0.6, 0.25), intensity: 1.5, range: 5, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(-4, 2.5, -2), color: new THREE.Color(0.3, 0.7, 0.9), intensity: 0.9, range: 6, flicker: 0.4 });
    this.addLight({ pos: new THREE.Vector3(4, 2.5, -2), color: new THREE.Color(0.9, 0.2, 0.3), intensity: 0.9, range: 6, flicker: 0.4 });

    T.drawWheel(this.wheelCanvas, [{ weight: 1, color: '#2a1020', label: '' }]);
    this.wheelTex.needsUpdate = true;

    this.camera.position.set(0, 2.5, 5.4);
    this.look.set(0, 2.8, -2.6);
  }

  intro() {
    this.camera.position.set(0, 1.6, 8);
    this.look.set(0, 2.2, -2.6);
    this.flyTo(new THREE.Vector3(0, 2.5, 5.4), new THREE.Vector3(0, 2.8, -2.6), 1.6, ease.outCubic);
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'wheel.setup': {
        T.drawWheel(this.wheelCanvas, e.sectors);
        this.wheelTex.needsUpdate = true;
        const total = e.sectors.reduce((s, x) => s + x.weight, 0);
        let acc = 0;
        this.bounds = e.sectors.map((s) => (acc += s.weight / total));
        break;
      }
      case 'wheel.spin': {
        const from = this.wheel.rotation.z % (Math.PI * 2);
        this.wheel.rotation.z = from;
        const turns = 5 + Math.floor(Math.random() * 2);
        const to = Math.PI * 2 * (turns + e.to);
        this.spinning = { from, to, t: 0, dur: e.duration, onTick: e.onTick, onDone: e.onDone, last: -1 };
        break;
      }
      case 'shrine.reveal': {
        const color = new THREE.Color(e.color);
        this.redLight.color.copy(color);
        this.redLight.intensity = 3;
        this.particles.emit(WHEEL_POS.clone().add(new THREE.Vector3(0, 0, 0.4)), { count: 120, color, color2: 0xffffff, speed: 4.5, life: 1.6, gravity: e.tone === 'curse' ? -3 : -1, size: 0.08 });
        if (e.tone === 'blessing' || e.tone === 'jackpot')
          this.particles.emit(new THREE.Vector3(0, 6, -1), { count: 80, color: 0xffd070, color2: 0xffffff, speed: 1, life: 2.5, gravity: -1.5, size: 0.06, radius: 3 });
        this.animate(1.5, (k) => (this.redLight.intensity = 3 - k * 1.7), ease.outCubic);
        break;
      }
      case 'shrine.pact':
        this.particles.emit(new THREE.Vector3(0, 1.4, 0.35), { count: 90, color: 0xb01020, color2: 0x501030, speed: 2.5, life: 1.6, gravity: 0.6, size: 0.08 });
        break;
      case 'shrine.hex':
        this.particles.emit(new THREE.Vector3(0, 2, 1), { count: 100, color: 0x6aff60, color2: 0x8a30c0, speed: 2.4, life: 2, gravity: 0.8, size: 0.09, drag: 1.2 });
        break;
      case 'shrine.cleanse':
        this.particles.emit(new THREE.Vector3(0, 1, 1), { count: 100, color: 0xffffff, color2: 0x8ff0ff, speed: 1.4, life: 2, gravity: 2, size: 0.06, radius: 1 });
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 1.6, 1), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.3, life: 1.5, gravity: 1.4, size: 0.05, radius: 0.8 });
        break;
    }
  }

  dispose() {
    super.dispose();
    this.wheelTex.dispose();
  }

  protected tick(dt: number) {
    const sp = this.spinning;
    if (sp) {
      sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      const eased = ease.outQuart(k);
      this.wheel.rotation.z = sp.from + (sp.to - sp.from) * eased;
      // The pointer sits at the top; find which sector is under it.
      const frac = (((this.wheel.rotation.z / (Math.PI * 2)) % 1) + 1) % 1;
      const idx = this.bounds.findIndex((b) => frac < b);
      if (idx !== sp.last) {
        sp.last = idx;
        sp.onTick?.();
        this.pointer.rotation.x = 0.35;
      }
      if (k >= 1) {
        this.spinning = null;
        sp.onDone?.();
      }
    } else {
      this.wheel.rotation.z += dt * 0.05;
    }
    this.pointer.rotation.x *= Math.max(0, 1 - dt * 12);
    if (Math.random() < dt * 8) {
      this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 4, 1.2, 0.3), { count: 1, color: 0xffa040, color2: 0xff3020, speed: 0.3, life: 1.8, gravity: 1, size: 0.035 });
    }
  }
}
