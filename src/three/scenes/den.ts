// The Cardsharp's Den: smoke, a green-felt table, an overhead lamp and the Dealer,
// who watches as giant cards circle above the table.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { candle, card, hoodedFigure, wall } from '../models';
import type { FxEvent } from '../fx';

const DECK: [string, string][] = [['A', '♠'], ['K', '♥'], ['Q', '♦'], ['J', '♣'], ['6', '♠'], ['10', '♥'], ['7', '♣'], ['A', '♦']];

export class DenScene extends BaseScene {
  private cards: THREE.Group[] = [];
  private orbit = new THREE.Group();
  private orbitSpeed = 0.25;
  private dealer = new THREE.Group();
  private lamp = new THREE.Group();
  private chips: THREE.Mesh[] = [];

  build() {
    this.baseFov = 56;
    this.ambient.setRGB(0.1, 0.07, 0.08);
    this.fogColor.setRGB(0.05, 0.02, 0.03);
    this.fogNear = 4;
    this.fogFar = 17;
    this.clearColor.copy(this.fogColor);

    const fl = new THREE.Mesh(new THREE.PlaneGeometry(14, 14, 10, 10), ps1({ map: T.woodPlanks(true), uvScale: [6, 6] }));
    fl.rotation.x = -Math.PI / 2;
    this.scene.add(fl);
    const paper = ps1({ map: T.damask(), uvScale: [6, 3] });
    for (let i = 0; i < 4; i++) {
      const w = wall(14, 6, paper, 8, 4);
      const a = (i * Math.PI) / 2;
      w.position.set(Math.sin(a) * -7, 3, Math.cos(a) * -7);
      w.rotation.y = a;
      this.scene.add(w);
    }
    const ceil = wall(14, 14, ps1({ map: T.woodPlanks(true), uvScale: [4, 4] }), 6, 6);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5;
    this.scene.add(ceil);

    // Table
    const feltTop = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.14, 16), [
      ps1({ map: T.woodPlanks(), uvScale: [6, 1] }),
      ps1({ map: T.felt('green'), uvScale: [3, 3] }),
      ps1({ map: T.woodPlanks(true) }),
    ]);
    feltTop.position.y = 1.05;
    this.scene.add(feltTop);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.1, 4, 16), ps1({ map: T.woodPlanks(true) }));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.13;
    this.scene.add(rail);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 1, 6), ps1({ map: T.woodPlanks(true) }));
    leg.position.y = 0.5;
    this.scene.add(leg);

    // Cards and chips on the felt
    for (let i = 0; i < 6; i++) {
      const c = card(DECK[i][0], DECK[i][1], 0.45);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = Math.random() * Math.PI;
      c.position.set((Math.random() - 0.5) * 2.2, 1.13 + i * 0.003, (Math.random() - 0.5) * 1.6);
      this.scene.add(c);
    }
    const chipColors = [0xb3221c, 0x1d4e8f, 0xe8dcb5, 0x111111];
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < 3 + s; k++) {
        const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8), ps1({ color: chipColors[s] }));
        chip.position.set(1.1 + (s % 2) * 0.28, 1.14 + k * 0.042, 0.4 + Math.floor(s / 2) * 0.3);
        this.chips.push(chip);
        this.scene.add(chip);
      }
    }
    const c1 = candle(0.3, 0.06);
    c1.group.position.set(-1.3, 1.12, -0.6);
    this.scene.add(c1.group);

    // The Dealer
    const fig = hoodedFigure(0x221a26, 0xffd040);
    fig.scale.setScalar(1.25);
    this.dealer.add(fig);
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 10), ps1({ color: 0x0e0a10 }));
    hatBrim.position.y = 2.8;
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.6, 8), ps1({ color: 0x0e0a10 }));
    hatTop.position.y = 3.1;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.1, 8), ps1({ color: 0x8a1020 }));
    band.position.y = 2.88;
    this.dealer.add(hatBrim, hatTop, band);
    const handMat = ps1({ map: T.bone() });
    for (const x of [-0.55, 0.55]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), handMat);
      hand.position.set(x, 1.32, 0.95);
      this.dealer.add(hand);
    }
    this.dealer.position.set(0, -0.6, -3.1);
    this.scene.add(this.dealer);

    // Orbiting giant cards
    DECK.forEach(([r, s], i) => {
      const c = card(r, s, 1.6);
      const a = (i / DECK.length) * Math.PI * 2;
      c.position.set(Math.cos(a) * 3.4, 2.9 + Math.sin(a * 2) * 0.25, Math.sin(a) * 3.4);
      c.userData.a = a;
      this.cards.push(c);
      this.orbit.add(c);
    });
    this.orbit.position.set(0, 0, -0.6);
    this.scene.add(this.orbit);

    // Overhead lamp
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 8, 1, true), ps1({ color: 0x1d4a2a, side: THREE.DoubleSide, emissive: 0x041008 }));
    shade.position.y = -1.4;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), ps1({ color: 0xfff0c0, unlit: true, fog: 0 }));
    bulb.position.y = -1.62;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 3), ps1({ color: 0x111111 }));
    cord.position.y = -0.55;
    this.lamp.add(shade, bulb, cord);
    this.lamp.position.set(0, 5, 0);
    this.scene.add(this.lamp);

    this.addLight({ pos: new THREE.Vector3(), color: new THREE.Color(1, 0.86, 0.6), intensity: 1.8, range: 5.5, flicker: 0.15, follow: bulb });
    this.addLight({ pos: new THREE.Vector3(-1.3, 1.6, -0.6), color: new THREE.Color(1, 0.5, 0.2), intensity: 0.9, range: 3.5, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(0, 2, -2.3), color: new THREE.Color(0.9, 0.7, 0.1), intensity: 0.5, range: 2.5, flicker: 0.5 });
    this.addLight({ pos: new THREE.Vector3(4, 3, 4), color: new THREE.Color(0.4, 0.15, 0.25), intensity: 0.8, range: 10 });

    this.camera.position.set(0, 2.6, 4.2);
    this.look.set(0, 1.9, -1.5);
  }

  intro() {
    this.camera.position.set(-4.5, 3.6, 5);
    this.look.set(0, 2.4, 0);
    this.flyTo(new THREE.Vector3(0, 2.6, 4.2), new THREE.Vector3(0, 1.9, -1.5), 3.4, ease.inOutCubic);
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'durak.out': {
        const c = this.cards[Math.floor(Math.random() * this.cards.length)];
        const y0 = c.position.y;
        this.animate(0.9, (k) => {
          c.position.y = y0 + Math.sin(k * Math.PI) * 1.2;
          c.rotation.y = k * Math.PI * 4;
        }, ease.outCubic);
        this.particles.emit(new THREE.Vector3(0, 1.4, 0), { count: 24, color: 0xe8dcb5, speed: 2, life: 0.9, gravity: 1, size: 0.05 });
        break;
      }
      case 'durak.fool': {
        this.orbitSpeed = 3;
        this.animate(2.4, (k) => (this.orbitSpeed = 3 - k * 2.75), ease.outCubic);
        const y0 = this.dealer.position.y;
        this.animate(1.2, (k) => {
          this.dealer.position.y = y0 + Math.abs(Math.sin(k * Math.PI * 6)) * 0.12;
          this.dealer.rotation.z = Math.sin(k * Math.PI * 8) * 0.05;
        }, ease.linear).then(() => {
          this.dealer.position.y = y0;
          this.dealer.rotation.z = 0;
        });
        this.particles.emit(new THREE.Vector3(0, 2.2, -2.6), { count: 50, color: 0xffd040, color2: 0xff3020, speed: 2.5, life: 1.2, gravity: -1, size: 0.07 });
        break;
      }
      case 'win':
        for (let i = 0; i < 6; i++)
          setTimeout(() => this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 3), { count: 40, color: e.color ?? 0xffd070, color2: 0xffffff, speed: 3, life: 1.5, gravity: -2.5, size: 0.06 }), i * 300);
        this.orbitSpeed = 2;
        this.animate(3, (k) => (this.orbitSpeed = 2 - k * 1.75), ease.outCubic);
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 1.6, 0.8), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.3, life: 1.5, gravity: 1.4, size: 0.045, radius: 0.8 });
        break;
    }
  }

  protected tick(dt: number) {
    this.orbit.rotation.y += dt * this.orbitSpeed;
    this.cards.forEach((c, i) => {
      c.lookAt(this.camera.position);
      c.rotation.z = Math.sin(this.time * 0.8 + i) * 0.15;
      c.position.y = 2.9 + Math.sin(this.time * 0.9 + i * 1.7) * 0.25;
    });
    this.lamp.rotation.z = Math.sin(this.time * 0.6) * 0.04;
    this.dealer.rotation.y = Math.sin(this.time * 0.3) * 0.12;
    // cigarette smoke
    if (Math.random() < dt * 10) {
      this.particles.emit(new THREE.Vector3(0.6 + (Math.random() - 0.5) * 0.2, 1.4, -2.2), { count: 1, color: 0x504048, speed: 0.15, life: 5, gravity: 0.25, size: 0.09, drag: 0.2 });
    }
  }
}
