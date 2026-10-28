// The Crossroads: a ring of altars floating in the void, one totem per game.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { candle, card, chessPiece, dart, paddle, skyDome } from '../models';
import type { FxEvent } from '../fx';

export const HUB_ORDER = ['darts', 'chess', 'durak', 'pingpong', 'universal'] as const;
const ACCENTS = [0xe8a33d, 0x9a62d6, 0xd9433b, 0x3fb3a6, 0x6ad1ff];
const RING_R = 5.2;

export class HubScene extends BaseScene {
  private ring = new THREE.Group();
  private totems: THREE.Group[] = [];
  private angle = 0;
  private targetAngle = 0;
  private selected = 0;
  private mode: 'title' | 'hub' | 'enter' = 'title';
  private sky!: THREE.Mesh;
  private rocks: THREE.Mesh[] = [];
  private runes!: THREE.Mesh;
  private eye!: THREE.Group;
  private eyeY = 4.6;
  private spot!: { color: THREE.Color; pos: THREE.Vector3; intensity: number; range: number };

  build() {
    this.baseFov = 52;
    this.ambient.setRGB(0.22, 0.17, 0.27);
    this.fogColor.setRGB(0.05, 0.03, 0.08);
    this.fogNear = 8;
    this.fogFar = 34;
    this.clearColor.setRGB(0.02, 0.01, 0.04);
    this.dirColor.setRGB(0.12, 0.12, 0.2);

    this.sky = skyDome(T.stars(), 90, [2, 1]);
    this.scene.add(this.sky);

    // Floating island platform
    const stone = ps1({ map: T.flagstone(), uvScale: [6, 6] });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.6, 16, 1), [ps1({ map: T.stoneBricks(), uvScale: [8, 1] }), stone, stone]);
    top.position.y = -0.3;
    this.scene.add(top);
    const under = new THREE.Mesh(new THREE.ConeGeometry(8, 7, 9, 3), ps1({ map: T.stoneBricks(), uvScale: [6, 3] }));
    under.rotation.x = Math.PI;
    under.position.y = -4.1;
    this.scene.add(under);

    this.runes = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      ps1({ map: T.runeRing(), unlit: true, transparent: true, additive: true, depthWrite: false, fog: 0.4 }),
    );
    this.runes.rotation.x = -Math.PI / 2;
    this.runes.position.y = 0.02;
    this.scene.add(this.runes);

    // The watcher above the ring
    this.eye = new THREE.Group();
    const iris = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), ps1({ map: T.darkMarble(), emissive: 0x2a0f3a }));
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.32, 8), ps1({ color: 0xff3040, unlit: true, fog: 0.3 }));
    pupil.position.z = 0.79;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 4, 16), ps1({ map: T.gold(), emissive: 0x332200 }));
    this.eye.add(iris, pupil, halo);
    this.eye.position.set(0, 4.6, 0);
    this.scene.add(this.eye);

    this.scene.add(this.ring);
    const pedestalMat = ps1({ map: T.stoneBricks(), uvScale: [1, 1] });
    HUB_ORDER.forEach((id, i) => {
      const a = (i / HUB_ORDER.length) * Math.PI * 2;
      const altar = new THREE.Group();
      altar.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
      altar.rotation.y = a;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.2, 6), pedestalMat);
      ped.position.y = 0.6;
      altar.add(ped);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 6), ps1({ map: T.darkMarble() }));
      plate.position.y = 1.26;
      altar.add(plate);
      for (const side of [-1, 1]) {
        const c = candle(0.5 + Math.random() * 0.25, 0.07);
        c.group.position.set(side * 0.65, 1.32, 0.35);
        altar.add(c.group);
      }
      const totem = this.makeTotem(id, ACCENTS[i]);
      totem.userData.spinner = id === 'chess' || id === 'universal';
      totem.position.y = 2.3;
      altar.add(totem);
      this.totems.push(totem);
      this.ring.add(altar);
    });

    for (let i = 0; i < 14; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 1.2, 0), ps1({ map: T.stoneBricks() }));
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 18;
      r.position.set(Math.cos(a) * d, -4 + Math.random() * 12, Math.sin(a) * d);
      r.userData.spin = (Math.random() - 0.5) * 0.4;
      this.rocks.push(r);
      this.scene.add(r);
    }

    this.addLight({ pos: new THREE.Vector3(0, 3.5, 0), color: new THREE.Color(0.5, 0.25, 0.7), intensity: 1, range: 12, flicker: 0.2 });
    this.spot = this.addLight({ pos: new THREE.Vector3(0, 3.4, RING_R + 1.6), color: new THREE.Color(ACCENTS[0]), intensity: 2.4, range: 6.5, flicker: 0.3 });
    this.addLight({ pos: new THREE.Vector3(-4, 2, 6), color: new THREE.Color(0.9, 0.5, 0.2), intensity: 0.8, range: 9, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(4, 2, 6), color: new THREE.Color(0.9, 0.5, 0.2), intensity: 0.8, range: 9, flicker: 1 });

    this.camera.position.set(0, 9, 17);
    this.look.set(0, 3.5, 0);
  }

  private makeTotem(id: (typeof HUB_ORDER)[number], accent: number): THREE.Group {
    const g = new THREE.Group();
    switch (id) {
      case 'darts': {
        const board = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 20), [
          ps1({ color: 0x241a14 }),
          ps1({ map: T.dartboard() }),
          ps1({ color: 0x241a14 }),
        ]);
        board.rotation.x = Math.PI / 2;
        g.add(board);
        for (let k = 0; k < 3; k++) {
          const d = dart([0xd9433b, 0xe8a33d, 0x7fb24a][k]);
          d.position.set(-0.2 + k * 0.2, 0.15 - k * 0.15, 0.06);
          d.rotation.set(-0.15 + k * 0.1, 0.2 - k * 0.2, 0);
          d.scale.setScalar(1.4);
          g.add(d);
        }
        break;
      }
      case 'chess': {
        const q = chessPiece('queen', ps1({ map: T.darkMarble(), color: 0xe0d0ff, emissive: 0x3a1a58 }), 10);
        q.scale.setScalar(1.15);
        q.position.y = -0.75;
        g.add(q);
        break;
      }
      case 'durak': {
        const cards: [string, string][] = [['6', '♠'], ['J', '♣'], ['Q', '♥'], ['K', '♦'], ['A', '♠']];
        cards.forEach(([r, s], k) => {
          const c = card(r, s, 1.1);
          c.rotation.z = (k - 2) * -0.28;
          c.position.set((k - 2) * 0.22, Math.cos((k - 2) * 0.5) * 0.15, k * 0.02);
          g.add(c);
        });
        break;
      }
      case 'pingpong': {
        const p = paddle(0xb3221c);
        p.rotation.z = -0.4;
        p.scale.setScalar(1.1);
        g.add(p);
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), ps1({ color: 0xf2efe6, emissive: 0x333333 }));
        ball.userData.orbit = true;
        g.add(ball);
        break;
      }
      case 'universal': {
        const d20 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 0), ps1({ map: T.darkMarble(), color: 0xc8b0ff, emissive: 0x3a2070 }));
        d20.userData.spin = true;
        g.add(d20);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 3, 18), ps1({ color: accent, unlit: true, fog: 0.3 }));
        ring.rotation.x = Math.PI / 2;
        ring.userData.tilt = true;
        g.add(ring);
        break;
      }
    }
    return g;
  }

  intro() {
    this.setMode('title');
  }

  private setMode(mode: 'title' | 'hub' | 'enter') {
    this.mode = mode;
    if (mode === 'title') {
      this.camera.position.set(0, 10, 18);
      this.look.set(0, 4.2, 0);
      this.flyTo(new THREE.Vector3(0, 6.5, 13), new THREE.Vector3(0, 4.4, 0), 4, ease.outCubic);
    } else if (mode === 'hub') {
      this.flyTo(new THREE.Vector3(0, 2.9, 10.8), new THREE.Vector3(0, 2.1, 5), 1.6, ease.inOutCubic);
    } else {
      this.flyTo(new THREE.Vector3(0, 2.4, 6.8), new THREE.Vector3(0, 2.3, 4.6), 0.9, ease.inOutCubic);
      this.particles.emit(new THREE.Vector3(0, 2.3, RING_R), { count: 60, color: ACCENTS[this.selected], speed: 3, life: 1, gravity: 0, size: 0.06 });
    }
  }

  fx(e: FxEvent) {
    if (e.type === 'hub.select') {
      const n = HUB_ORDER.length;
      const delta = ((e.index - this.selected + n + n / 2) % n) - n / 2;
      this.selected = e.index;
      this.targetAngle += (-delta * Math.PI * 2) / n;
      this.spot.color.set(ACCENTS[e.index]);
      this.particles.emit(new THREE.Vector3(0, 1.4, RING_R), { count: 18, color: ACCENTS[e.index], speed: 1.4, life: 0.9, gravity: 1, size: 0.05 });
    } else if (e.type === 'hub.mode') {
      this.setMode(e.mode);
    }
  }

  protected tick(dt: number) {
    this.angle += (this.targetAngle - this.angle) * Math.min(1, dt * 5);
    this.ring.rotation.y = this.angle;
    this.sky.rotation.y += dt * 0.004;
    this.runes.rotation.z += dt * 0.08;
    this.eyeY += ((this.mode === 'title' ? 4.6 : 8.4) - this.eyeY) * Math.min(1, dt * 1.5);
    this.eye.position.y = this.eyeY + Math.sin(this.time * 0.8) * 0.15;
    // the eye watches the selected altar
    this.eye.rotation.y += (0 - this.eye.rotation.y) * dt * 2;
    this.eye.rotation.x = this.mode === 'title' ? 0.15 : 0.55;
    this.totems.forEach((t, i) => {
      const active = i === this.selected;
      const flat = !t.userData.spinner;
      if (flat) t.rotation.y = Math.sin(this.time * (active ? 0.9 : 0.4) + i) * (active ? 0.5 : 0.25);
      else t.rotation.y += dt * (active ? 0.9 : 0.25);
      t.position.y = 2.3 + Math.sin(this.time * 1.4 + i) * 0.1 + (active ? 0.15 : 0);
      const s = active ? 1.12 : 0.92;
      t.scale.lerp(new THREE.Vector3(s, s, s), dt * 4);
      t.traverse((o) => {
        if (o.userData.orbit) o.position.set(Math.cos(this.time * 2.4) * 0.65, 0.35 + Math.abs(Math.sin(this.time * 4.8)) * 0.4, Math.sin(this.time * 2.4) * 0.65);
        if (o.userData.tilt) o.rotation.y = this.time;
      });
    });
    for (const r of this.rocks) {
      r.rotation.y += r.userData.spin * dt;
      r.position.y += Math.sin(this.time + r.id) * dt * 0.08;
    }
    if (Math.random() < dt * 8) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(new THREE.Vector3(Math.cos(a) * 7, 0.2, Math.sin(a) * 7), {
        count: 1,
        color: 0x9a62d6,
        color2: 0x6ad1ff,
        speed: 0.2,
        life: 4,
        gravity: 0.25,
        size: 0.05,
      });
    }
  }
}
