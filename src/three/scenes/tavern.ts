// Tavern «The Crooked Dart»: a dartboard where every thrown dart actually lands
// where the scorekeeper says it did.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { candle, dart, flameSprite, wall } from '../models';
import type { FxEvent } from '../fx';

const BOARD_POS = new THREE.Vector3(0, 2.25, -5.85);
const PLAY_R = 0.95;
const DART_COLORS = [0xd9433b, 0xe8a33d, 0x7fb24a, 0x4a86d9, 0x9a62d6];

export class TavernScene extends BaseScene {
  private board = new THREE.Group();
  private darts: THREE.Group[] = [];
  private lantern = new THREE.Group();
  private fire = new THREE.Group();

  build() {
    this.baseFov = 55;
    this.ambient.setRGB(0.14, 0.09, 0.07);
    this.fogColor.setRGB(0.05, 0.03, 0.02);
    this.fogNear = 5;
    this.fogFar = 20;
    this.clearColor.copy(this.fogColor);

    const planks = ps1({ map: T.woodPlanks(), uvScale: [6, 6] });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(14, 16, 10, 10), planks);
    fl.rotation.x = -Math.PI / 2;
    fl.position.z = -1;
    this.scene.add(fl);
    const darkWood = ps1({ map: T.woodPlanks(true), uvScale: [5, 2] });
    const back = wall(14, 6, darkWood, 8, 4);
    back.position.set(0, 3, -6);
    this.scene.add(back);
    for (const side of [-1, 1]) {
      const w = wall(16, 6, darkWood, 8, 4);
      w.position.set(side * 7, 3, -1);
      w.rotation.y = -side * Math.PI / 2;
      this.scene.add(w);
    }
    const ceil = wall(14, 16, darkWood, 6, 6);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 5.5, -1);
    this.scene.add(ceil);
    const beamMat = ps1({ map: T.woodPlanks(true), uvScale: [1, 4] });
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 0.35), beamMat);
      beam.position.set(0, 5.3, -5 + i * 3.5);
      this.scene.add(beam);
    }

    // Dartboard with cabinet and number ring
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.16), ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }));
    cabinet.position.set(BOARD_POS.x, BOARD_POS.y, -5.94);
    this.scene.add(cabinet);
    const surround = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), ps1({ color: 0x1a1210 }));
    surround.position.set(BOARD_POS.x, BOARD_POS.y, -5.87);
    this.scene.add(surround);
    const face = new THREE.Mesh(new THREE.CircleGeometry(PLAY_R / 0.8, 32), ps1({ map: T.dartboard() }));
    this.board.add(face);
    this.board.position.copy(BOARD_POS);
    this.scene.add(this.board);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 6, 1, true), ps1({ map: T.metal(), side: THREE.DoubleSide }));
    lamp.position.set(0, 4.3, -5.2);
    this.scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), ps1({ color: 0xfff0c0, unlit: true, fog: 0 }));
    bulb.position.set(0, 4.15, -5.2);
    this.scene.add(bulb);

    // Throw line
    const oche = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.12), ps1({ color: 0x9a1a14, emissive: 0x200000 }));
    oche.position.set(0, 0.02, 2.37);
    this.scene.add(oche);

    // Fireplace on the left
    const fpMat = ps1({ map: T.stoneBricks(), uvScale: [2, 2] });
    const fpBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 2.6), fpMat);
    fpBack.position.set(-6.7, 1.2, -2);
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 3), ps1({ map: T.woodPlanks(true) }));
    mantel.position.set(-6.5, 2.5, -2);
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 1.7), ps1({ color: 0x050302 }));
    hearth.position.set(-6.35, 0.75, -2);
    this.scene.add(fpBack, mantel, hearth);
    for (let i = 0; i < 4; i++) {
      const f = flameSprite(0.6 + Math.random() * 0.3, 0.9 + Math.random() * 0.4);
      f.position.set(-6.1, 0.45, -2.5 + i * 0.33);
      this.fire.add(f);
    }
    this.scene.add(this.fire);
    const skull = new THREE.Group();
    const cranium = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), ps1({ map: T.bone() }));
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.2), ps1({ map: T.bone() }));
    jaw.position.set(0, -0.17, 0.04);
    const eyeMat = ps1({ color: 0x000000 });
    for (const x of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), eyeMat);
      e.position.set(x, 0, 0.2);
      skull.add(e);
    }
    skull.add(cranium, jaw);
    skull.position.set(-6.3, 2.88, -1.4);
    skull.rotation.y = Math.PI / 2;
    this.scene.add(skull);

    // Furniture
    const barrelMat = ps1({ map: T.woodPlanks(), uvScale: [3, 1] });
    const barrels: [number, number, number][] = [[5.6, 0, -4.8], [6.1, 0, -3.6], [5.7, 1.1, -4.2]];
    for (const [x, y, z] of barrels) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.1, 8), barrelMat);
      b.position.set(x, y + 0.55, z);
      this.scene.add(b);
    }
    const tableMat = ps1({ map: T.woodPlanks(), uvScale: [2, 1] });
    for (const [x, z] of [[4.4, 0.8], [-4.2, 2.2]] as [number, number][]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 8), tableMat);
      top.position.set(x, 1.0, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 1, 5), tableMat);
      leg.position.set(x, 0.5, z);
      this.scene.add(top, leg);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.26, 6), ps1({ map: T.metal(), color: 0xc0a080 }));
      mug.position.set(x + 0.3, 1.18, z - 0.1);
      this.scene.add(mug);
      const c = candle(0.25, 0.05);
      c.group.position.set(x - 0.2, 1.05, z + 0.2);
      this.scene.add(c.group);
    }
    for (const [x, z] of [[-6.95, 1.5], [6.95, -1]] as [number, number][]) {
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), ps1({ map: T.parchment() }));
      poster.position.set(x, 2.6, z);
      poster.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(poster);
    }

    // Swinging lantern
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 3), ps1({ color: 0x333333 }));
    chain.position.y = -0.6;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 6), ps1({ map: T.metal(), emissive: 0x332200 }));
    cage.position.y = -1.35;
    const glow = flameSprite(0.22, 0.34);
    glow.position.y = -1.38;
    this.lantern.add(chain, cage, glow);
    this.lantern.position.set(1.6, 5.5, 0.5);
    this.scene.add(this.lantern);

    this.addLight({ pos: new THREE.Vector3(0, 3.9, -4.6), color: new THREE.Color(1, 0.9, 0.7), intensity: 1.6, range: 5.5, flicker: 0.1 });
    this.addLight({ pos: new THREE.Vector3(-5.8, 1.2, -2), color: new THREE.Color(1, 0.45, 0.15), intensity: 2, range: 9, flicker: 1.4 });
    this.addLight({ pos: new THREE.Vector3(), color: new THREE.Color(1, 0.7, 0.35), intensity: 1.1, range: 6.5, flicker: 0.6, follow: glow });
    this.addLight({ pos: new THREE.Vector3(0, 2.5, 5), color: new THREE.Color(0.35, 0.3, 0.5), intensity: 0.7, range: 10 });

    this.camera.position.set(-0.4, 2.0, 0.6);
    this.look.copy(BOARD_POS);
  }

  intro() {
    this.camera.position.set(3.5, 2.6, 6.5);
    this.look.set(-6, 1.2, -2);
    this.flyTo(new THREE.Vector3(0.6, 2.0, 4.6), new THREE.Vector3(-3, 1.6, -4), 2.2, ease.inOutCubic).then(() =>
      this.flyTo(new THREE.Vector3(-0.4, 2.0, 0.6), BOARD_POS.clone().add(new THREE.Vector3(0.6, -0.1, 0)), 2.2, ease.inOutCubic),
    );
  }

  /** Point on the board for a hit. */
  private hitPoint(n: number, m: number): THREE.Vector3 {
    const R = T.DART_RINGS;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let r: number;
    let angle: number;
    if (n === 0) {
      r = rnd(1.08, 1.35);
      angle = rnd(0, Math.PI * 2);
    } else if (n === 25) {
      r = m === 2 ? rnd(0, R.bull * 0.9) : rnd(R.bull * 1.6, R.outerBull * 0.95);
      angle = rnd(0, Math.PI * 2);
    } else {
      const i = T.DART_ORDER.indexOf(n);
      angle = (i * Math.PI * 2) / 20 + rnd(-0.11, 0.11);
      if (m === 3) r = rnd(R.tripleIn + 0.008, R.tripleOut - 0.008);
      else if (m === 2) r = rnd(R.doubleIn + 0.008, 0.99);
      else r = Math.random() < 0.55 ? rnd(R.outerBull + 0.05, R.tripleIn - 0.04) : rnd(R.tripleOut + 0.04, R.doubleIn - 0.04);
    }
    return new THREE.Vector3(BOARD_POS.x + Math.sin(angle) * r * PLAY_R, BOARD_POS.y + Math.cos(angle) * r * PLAY_R, BOARD_POS.z + 0.02);
  }

  private throwDart(n: number, m: number) {
    const d = dart(DART_COLORS[this.darts.length % DART_COLORS.length]);
    d.scale.setScalar(1.6);
    const target = this.hitPoint(n, m);
    const start = new THREE.Vector3(this.camera.position.x + 0.35, this.camera.position.y - 0.25, this.camera.position.z - 0.4);
    d.position.copy(start);
    this.scene.add(d);
    this.darts.push(d);
    const forward = new THREE.Vector3(0, 0, -1);
    const prev = start.clone();
    this.animate(
      0.32,
      (k) => {
        const p = start.clone().lerp(target, k);
        p.y += Math.sin(k * Math.PI) * 0.35;
        const dir = p.clone().sub(prev);
        if (dir.lengthSq() > 1e-6) d.quaternion.setFromUnitVectors(forward, dir.normalize());
        prev.copy(p);
        d.position.copy(p);
      },
      ease.linear,
    ).then(() => {
      d.position.copy(target);
      d.quaternion.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, Math.random() * Math.PI));
      const col = m === 3 ? 0xffd070 : m === 2 ? 0xff6050 : n === 25 ? 0x60ff90 : 0xd8cfb8;
      this.particles.emit(target, { count: n === 0 ? 6 : 14 + m * 6, color: col, speed: 1.6, life: 0.6, gravity: -2, size: 0.04 });
      // board wobble
      this.animate(0.3, (k) => (this.board.rotation.z = Math.sin(k * Math.PI * 4) * 0.01 * (1 - k)), ease.linear);
    });
  }

  private clearDarts(fall = false) {
    const old = this.darts.splice(0);
    old.forEach((d) => {
      const p0 = d.position.clone();
      const s0 = d.scale.x;
      this.animate(
        fall ? 0.7 : 0.45,
        (k) => {
          if (fall) {
            d.position.set(p0.x, p0.y - k * k * (p0.y - 0.05), p0.z + k * 0.6);
            d.rotation.x += 0.15;
          } else {
            d.position.set(p0.x, p0.y, p0.z + k * 1.5);
            d.scale.setScalar(s0 * (1 - k));
          }
        },
        ease.linear,
      ).then(() => {
        this.scene.remove(d);
        d.traverse((o) => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose();
          (mesh.material as THREE.Material | undefined)?.dispose?.();
        });
      });
    });
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'darts.hit':
        if (this.darts.length >= 5) this.clearDarts();
        this.throwDart(e.n, e.m);
        break;
      case 'darts.clear':
        setTimeout(() => this.clearDarts(), 650);
        break;
      case 'darts.bust':
        setTimeout(() => {
          this.clearDarts(true);
          this.particles.emit(BOARD_POS, { count: 40, color: 0xff3020, speed: 3, life: 0.8, gravity: -3, size: 0.06, radius: 0.6 });
        }, 400);
        break;
      case 'darts.big':
        for (let i = 0; i < (e.score >= 180 ? 8 : 3); i++)
          setTimeout(() => this.particles.emit(BOARD_POS.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, 0.6)), { count: 40, color: 0xffd070, color2: 0xff6030, speed: 3, life: 1.2, gravity: -2, size: 0.07 }), i * 180);
        break;
      case 'win':
        for (let i = 0; i < 8; i++)
          setTimeout(() => this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random(), -3 - Math.random() * 2), { count: 50, color: e.color ?? 0xffd070, color2: 0xffffff, speed: 3.5, life: 1.6, gravity: -2.5, size: 0.07 }), i * 250);
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 1.4, 1.2), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.2, life: 1.5, gravity: 1.4, size: 0.04, radius: 0.6 });
        break;
    }
  }

  protected tick(dt: number) {
    this.lantern.rotation.z = Math.sin(this.time * 1.1) * 0.12;
    this.lantern.rotation.x = Math.sin(this.time * 0.7) * 0.05;
    if (Math.random() < dt * 14) {
      this.particles.emit(new THREE.Vector3(-6.1, 0.8, -2 + (Math.random() - 0.5)), { count: 1, color: 0xffa040, color2: 0xff5020, speed: 0.6, life: 1.4, gravity: 1.6, size: 0.04 });
    }
    if (Math.random() < dt * 4) {
      this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 8, 3.5, (Math.random() - 0.5) * 8), { count: 1, color: 0x806050, speed: 0.05, life: 6, gravity: -0.05, size: 0.03 });
    }
  }
}
