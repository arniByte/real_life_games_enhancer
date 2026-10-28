// The Basement Arena: a ping-pong table under buzzing tubes, behind a chain-link fence.
// A ghost rally plays on forever; points smash the ball to the loser's side.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { paddle, wall } from '../models';
import type { FxEvent } from '../fx';

const TABLE_L = 3.8;
const TABLE_W = 2.1;
const TABLE_H = 1.05;

export class ArenaScene extends BaseScene {
  private ball!: THREE.Mesh;
  private paddles: THREE.Group[] = [];
  private phase = 0;
  private dir = 1;
  private smash: { t: number; side: 0 | 1 } | null = null;
  private tubes: THREE.Mesh[] = [];
  private badTube!: { intensity: number };

  build() {
    this.baseFov = 55;
    this.ambient.setRGB(0.2, 0.21, 0.23);
    this.fogColor.setRGB(0.03, 0.04, 0.045);
    this.fogNear = 5;
    this.fogFar = 22;
    this.clearColor.copy(this.fogColor);

    const fl = new THREE.Mesh(new THREE.PlaneGeometry(16, 16, 10, 10), ps1({ map: T.tiles(), uvScale: [8, 8] }));
    fl.rotation.x = -Math.PI / 2;
    this.scene.add(fl);
    const conc = ps1({ map: T.concrete(), uvScale: [4, 2] });
    for (let i = 0; i < 4; i++) {
      const w = wall(16, 6, conc, 8, 3);
      const a = (i * Math.PI) / 2;
      w.position.set(Math.sin(a) * -8, 3, Math.cos(a) * -8);
      w.rotation.y = a;
      this.scene.add(w);
    }
    const ceil = wall(16, 16, ps1({ map: T.concrete(), uvScale: [4, 4] }), 6, 6);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5;
    this.scene.add(ceil);
    const graf = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), ps1({ map: T.graffiti(), transparent: true, alphaTest: 0.3 }));
    graf.position.set(-2, 2.8, -7.95);
    this.scene.add(graf);

    // Pipes along the wall
    const pipeMat = ps1({ map: T.metal(), color: 0x8a7a60 });
    for (let k = 0; k < 3; k++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 16, 5), pipeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 4.2 + k * 0.25, -7.8);
      this.scene.add(pipe);
    }

    // Table
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_L, 0.08, TABLE_W), [
      ps1({ color: 0x0c2240 }),
      ps1({ color: 0x0c2240 }),
      ps1({ map: T.pingTable() }),
      ps1({ color: 0x0c2240 }),
      ps1({ color: 0xe0e0d8 }),
      ps1({ color: 0xe0e0d8 }),
    ]);
    top.position.y = TABLE_H;
    this.scene.add(top);
    const legMat = ps1({ map: T.metal(), color: 0x444444 });
    for (const x of [-1.6, 1.6])
      for (const z of [-0.85, 0.85]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, TABLE_H, 0.08), legMat);
        leg.position.set(x, TABLE_H / 2, z);
        this.scene.add(leg);
      }
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_W + 0.3, 0.24),
      ps1({ map: T.fence(), uvScale: [10, 1.5], transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xffffff, unlit: true, fog: 0.5 }),
    );
    net.rotation.y = Math.PI / 2;
    net.position.set(0, TABLE_H + 0.16, 0);
    this.scene.add(net);

    // Fence ring
    const fenceMat = ps1({ map: T.fence(), uvScale: [6, 3], transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xb0b0a0 });
    for (const [x, z, ry] of [[0, -4.5, 0], [-6, 0, Math.PI / 2], [6, 0, Math.PI / 2]] as [number, number, number][]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(9, 3, 4, 2), fenceMat);
      f.position.set(x, 1.5, z);
      f.rotation.y = ry;
      this.scene.add(f);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 4), legMat);
      post.position.set(x + (ry ? 0 : 4.5), 1.6, z + (ry ? 4.5 : 0));
      this.scene.add(post);
    }

    // Tubes
    const tubeMat = ps1({ color: 0xd8f0ff, unlit: true, fog: 0.2 });
    for (const x of [-2.5, 2.5]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.12), tubeMat.clone());
      t.position.set(x, 4.6, 0);
      this.tubes.push(t);
      this.scene.add(t);
    }

    // Paddles + ball
    this.paddles = [paddle(0xb3221c), paddle(0x151515)];
    this.paddles[0].position.set(-TABLE_L / 2 - 0.6, TABLE_H + 0.5, 0);
    this.paddles[0].rotation.y = Math.PI / 2;
    this.paddles[1].position.set(TABLE_L / 2 + 0.6, TABLE_H + 0.5, 0);
    this.paddles[1].rotation.y = -Math.PI / 2;
    this.paddles.forEach((p) => this.scene.add(p));
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), ps1({ color: 0xffffff, emissive: 0x666655 }));
    this.scene.add(this.ball);

    this.addLight({ pos: new THREE.Vector3(-2.5, 4.4, 0), color: new THREE.Color(0.75, 0.9, 1), intensity: 2.2, range: 11, flicker: 0.05 });
    this.badTube = this.addLight({ pos: new THREE.Vector3(2.5, 4.4, 0), color: new THREE.Color(0.75, 0.9, 1), intensity: 2.2, range: 11 });
    this.addLight({ pos: new THREE.Vector3(0, 1.5, 5), color: new THREE.Color(0.6, 0.15, 0.3), intensity: 0.7, range: 9 });

    this.camera.position.set(-0.8, 2.6, 4.4);
    this.look.set(0.6, 1.2, 0);
  }

  intro() {
    this.camera.position.set(5, 4.2, 6);
    this.look.set(0, 1, 0);
    this.flyTo(new THREE.Vector3(-0.8, 2.6, 4.4), new THREE.Vector3(0.6, 1.2, 0), 3, ease.inOutCubic);
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'pp.point':
        this.smash = { t: 0, side: e.side };
        this.particles.emit(new THREE.Vector3(e.side === 0 ? -1.8 : 1.8, TABLE_H + 0.5, 0), { count: 40, color: e.color, color2: 0xffffff, speed: 2.5, life: 0.9, gravity: -2, size: 0.05 });
        break;
      case 'win':
        for (let i = 0; i < 7; i++)
          setTimeout(() => this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 6, 3.5, (Math.random() - 0.5) * 3), { count: 45, color: e.color ?? 0xffd070, color2: 0xffffff, speed: 3, life: 1.5, gravity: -2.5, size: 0.06 }), i * 280);
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 2, 1.5), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.2, life: 1.5, gravity: 1.4, size: 0.045, radius: 0.8 });
        break;
    }
  }

  protected tick(dt: number) {
    // flickering tube
    const broken = Math.sin(this.time * 7) > 0.92 || Math.sin(this.time * 13.3) > 0.97;
    this.badTube.intensity = broken ? 0.3 : 2.2;
    (this.tubes[1].material as THREE.ShaderMaterial).uniforms.uColor.value.setScalar(broken ? 0.3 : 1);

    if (this.smash) {
      this.smash.t += dt;
      const k = Math.min(1, this.smash.t / 0.6);
      const toward = this.smash.side === 0 ? 1 : -1;
      this.ball.position.set(toward * (k * 6), TABLE_H + 0.3 + Math.sin(k * Math.PI) * 0.6 - k * 0.8, k * 1.5);
      if (this.smash.t > 1.2) {
        this.smash = null;
        this.phase = 0;
        this.dir = toward;
      }
      return;
    }
    // Ghost rally: arc across the table with a bounce on the far half.
    const speed = 0.8;
    this.phase += dt * speed;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.dir *= -1;
    }
    const k = this.phase;
    const xStart = -this.dir * (TABLE_L / 2 + 0.45);
    const xEnd = this.dir * (TABLE_L / 2 + 0.45);
    const x = xStart + (xEnd - xStart) * k;
    const bounceAt = 0.7;
    const y =
      k < bounceAt
        ? TABLE_H + 0.06 + Math.sin((k / bounceAt) * Math.PI) * 0.55 + (1 - k / bounceAt) * 0.35
        : TABLE_H + 0.06 + Math.sin(((k - bounceAt) / (1 - bounceAt)) * Math.PI) * 0.45;
    const z = Math.sin(this.time * 1.3) * 0.5;
    this.ball.position.set(x, y, z);
    if (Math.abs(k - bounceAt) < dt * speed) {
      this.particles.emit(new THREE.Vector3(x, TABLE_H + 0.05, z), { count: 4, color: 0xffffff, speed: 0.6, life: 0.3, gravity: 0, size: 0.03 });
    }
    this.paddles.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      const targetY = side === Math.sign(x) ? y + 0.1 : TABLE_H + 0.5;
      p.position.y += (targetY - p.position.y) * Math.min(1, dt * 6);
      p.position.z += (z - p.position.z) * Math.min(1, dt * 5);
      p.rotation.z = side * (0.3 + Math.sin(this.time * 2 + i) * 0.1);
    });
  }
}
