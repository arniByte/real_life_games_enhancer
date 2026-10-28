// Citadel of the Black Queen: a living chessboard hall guarded by a giant rook
// and the Queen herself, spear in hand.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { chessPiece, flameSprite, pillar, wall, type ChessPiece } from '../models';
import type { FxEvent } from '../fx';

const SQ = 2;

export class CastleScene extends BaseScene {
  private queen = new THREE.Group();
  private spear = new THREE.Group();
  private rook = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private pieces: { obj: THREE.Group; kind: ChessPiece; alive: boolean }[] = [];
  private banners: THREE.Mesh[] = [];
  private spearBase = new THREE.Euler();

  build() {
    this.baseFov = 58;
    this.ambient.setRGB(0.2, 0.16, 0.26);
    this.fogColor.setRGB(0.05, 0.025, 0.08);
    this.fogNear = 12;
    this.fogFar = 48;
    this.clearColor.copy(this.fogColor);
    this.dirColor.setRGB(0.1, 0.1, 0.18);

    const checker = ps1({ map: T.marbleChecker(), uvScale: [8, 12] });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 16, SQ * 24, 16, 24), checker);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, 0, -6);
    this.scene.add(fl);

    const brick = ps1({ map: T.stoneBricks(), uvScale: [12, 4] });
    for (const side of [-1, 1]) {
      const w = wall(48, 14, brick, 12, 4);
      w.position.set(side * 9, 7, -6);
      w.rotation.y = -side * Math.PI / 2;
      this.scene.add(w);
    }
    const back = wall(18, 14, ps1({ map: T.stoneBricks(), uvScale: [5, 4] }), 6, 4);
    back.position.set(0, 7, -28);
    this.scene.add(back);
    const ceil = wall(18, 48, ps1({ map: T.woodPlanks(true), uvScale: [6, 16] }), 6, 12);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 13, -6);
    this.scene.add(ceil);

    // Colonnade with banners and torches
    const pmat = ps1({ map: T.stoneBricks(), uvScale: [2, 4] });
    for (let i = 0; i < 5; i++) {
      const z = 10 - i * 8;
      for (const side of [-1, 1]) {
        const p = pillar(12, 0.55, pmat);
        p.position.set(side * 7, 0, z);
        this.scene.add(p);
        if (i % 2 === 0) {
          const b = new THREE.Mesh(
            new THREE.PlaneGeometry(1.6, 3.6, 2, 6),
            ps1({ map: T.banner('queen', side > 0 ? [100, 14, 30] : [40, 18, 70]), side: THREE.DoubleSide, wave: 0.05 }),
          );
          b.position.set(side * 8.9, 7.5, z - 4);
          b.rotation.y = -side * Math.PI / 2;
          this.banners.push(b);
          this.scene.add(b);
        }
        const torch = flameSprite(0.5, 0.8);
        torch.position.set(side * 6.35, 4.4, z);
        this.scene.add(torch);
        const holder = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 5), ps1({ map: T.metal() }));
        holder.rotation.x = Math.PI;
        holder.position.set(side * 6.4, 4.05, z);
        this.scene.add(holder);
      }
    }

    // Throne dais
    const dais = ps1({ map: T.darkMarble(), uvScale: [3, 1] });
    for (let k = 0; k < 3; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(12 - k * 2.5, 0.5, 6 - k * 1.4), dais);
      step.position.set(0, 0.25 + k * 0.5, -22 + k * 0.5);
      this.scene.add(step);
    }

    // The Queen
    const qMat = ps1({ map: T.darkMarble(), color: new THREE.Color(2.4, 2.1, 3.0), emissive: 0x2c1448 });
    const q = chessPiece('queen', qMat, 12);
    q.scale.setScalar(5.2);
    this.queen.add(q);
    const eyeMat = ps1({ color: 0xff2a3a, unlit: true, fog: 0.15 });
    for (const x of [-0.42, 0.42]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), eyeMat);
      e.position.set(x, 5.75, 1.14);
      this.eyes.push(e);
      this.queen.add(e);
    }
    // spear
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 9, 5), ps1({ map: T.woodPlanks(true) }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 4), ps1({ map: T.metal(), emissive: 0x221010 }));
    head.position.y = 5.1;
    const tassel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9, 1, 3), ps1({ color: 0x8a1020, side: THREE.DoubleSide, wave: 0.08 }));
    tassel.position.y = 4.1;
    this.spear.add(shaft, head, tassel);
    this.spear.position.set(2.1, 4.3, 0.6);
    this.spear.rotation.set(0.05, 0, -0.12);
    this.spearBase.copy(this.spear.rotation);
    this.queen.add(this.spear);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 5), qMat);
    arm.position.set(1.3, 4.6, 0.4);
    arm.rotation.z = 1.1;
    this.queen.add(arm);
    this.queen.position.set(0, 1.5, -22);
    this.scene.add(this.queen);

    // The Rook guardian
    const r = chessPiece('rook', ps1({ map: T.stoneBricks(), color: 0xd8d0c8, uvScale: [3, 2] }), 8);
    r.scale.setScalar(3.6);
    this.rook.add(r);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), ps1({ color: 0xffa040, unlit: true, fog: 0.2 }));
    slit.position.set(0, 2.9, 0.86);
    this.rook.add(slit);
    this.rook.position.set(-4.2, 0, -13);
    this.rook.rotation.y = 0.5;
    this.scene.add(this.rook);

    // A frozen game on the floor
    const white = ps1({ map: T.bone(), color: 0xf0e8dc });
    const black = ps1({ map: T.darkMarble() });
    const layout: [ChessPiece, number, number, boolean][] = [
      ['pawn', -3, 2, true], ['pawn', -1, 3, true], ['pawn', 1, 2, true], ['knight', 3, 4, true], ['bishop', -2, 5, true],
      ['pawn', -2, -1, false], ['pawn', 2, -2, false], ['knight', -4, -3, false], ['rook', 4, -4, false], ['bishop', 0, -1, false],
      ['pawn', 0, 1, false], ['king', 3, -6, false], ['king', -1, 6, true],
    ];
    for (const [kind, x, z, isWhite] of layout) {
      const p = chessPiece(kind, isWhite ? white : black, 8);
      p.scale.setScalar(1.25);
      p.position.set(x * SQ + SQ / 2, 0, z * SQ - 6 + SQ / 2);
      p.rotation.y = isWhite ? Math.PI : 0;
      this.pieces.push({ obj: p, kind, alive: true });
      this.scene.add(p);
    }

    this.addLight({ pos: new THREE.Vector3(-6.3, 4.6, -2), color: new THREE.Color(1, 0.55, 0.22), intensity: 1.8, range: 14, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(6.3, 4.6, -10), color: new THREE.Color(1, 0.55, 0.22), intensity: 1.8, range: 14, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(0, 10, -14), color: new THREE.Color(0.6, 0.3, 1), intensity: 2.2, range: 18, flicker: 0.2 });
    this.addLight({ pos: new THREE.Vector3(2.5, 6.5, -17.5), color: new THREE.Color(1, 0.2, 0.25), intensity: 1.6, range: 8, flicker: 0.3 });

    this.camera.position.set(0, 3.2, 16);
    this.look.set(0, 3, 0);
  }

  intro() {
    this.camera.position.set(0, 2.2, 17);
    this.look.set(0, 2.4, 0);
    this.flyTo(new THREE.Vector3(0, 3.2, -4), new THREE.Vector3(0, 7, -22), 4.2, ease.inOutCubic).then(() =>
      this.flyTo(new THREE.Vector3(-1.6, 3.6, -4), new THREE.Vector3(0.2, 5.4, -22), 2.5, ease.inOutCubic),
    );
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'chess.capture': {
        const kind: ChessPiece = ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' } as Record<string, ChessPiece>)[e.piece] ?? 'pawn';
        const victim = this.pieces.find((p) => p.alive && p.kind === kind) ?? this.pieces.find((p) => p.alive);
        if (victim) {
          victim.alive = false;
          const at = victim.obj.position.clone().add(new THREE.Vector3(0, 0.8, 0));
          this.particles.emit(at, { count: 50, color: 0xd8cfb8, color2: 0x9a62d6, speed: 3, life: 1.4, gravity: -4, size: 0.08 });
          this.animate(0.8, (k) => {
            victim.obj.scale.setScalar(1.25 * (1 - k));
            victim.obj.rotation.z = k * 1.2;
          }, ease.outCubic);
          setTimeout(() => {
            victim.alive = true;
            this.animate(1.2, (k) => {
              victim.obj.scale.setScalar(1.25 * k);
              victim.obj.rotation.z = 0;
            }, ease.outBack);
          }, 9000);
        }
        this.strike();
        break;
      }
      case 'chess.check':
        this.rookSlam();
        this.eyes.forEach((m) => (m.material as THREE.ShaderMaterial).uniforms.uColor.value.set(0xffffff));
        setTimeout(() => this.eyes.forEach((m) => (m.material as THREE.ShaderMaterial).uniforms.uColor.value.set(0xff2a3a)), 600);
        break;
      case 'chess.move':
        this.particles.emit(new THREE.Vector3(e.side === 'w' ? -3 : 3, 0.3, 4), { count: 10, color: e.side === 'w' ? 0xf0e8dc : 0x9a62d6, speed: 1, life: 1, gravity: 1, size: 0.05 });
        break;
      case 'win':
        this.strike();
        for (let i = 0; i < 6; i++)
          setTimeout(() => this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 3, -10 - Math.random() * 8), { count: 60, color: e.color ?? 0xffd070, color2: 0xffffff, speed: 4, life: 1.8, gravity: -2.5, size: 0.1 }), i * 350);
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 2.5, 0), { count: 12 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.5, life: 1.6, gravity: 1.5, size: 0.06, radius: 1 });
        break;
    }
  }

  private strike() {
    this.animate(0.25, (k) => (this.spear.rotation.x = this.spearBase.x - k * 0.7), ease.outCubic).then(() =>
      this.animate(0.7, (k) => (this.spear.rotation.x = this.spearBase.x - 0.7 * (1 - k)), ease.outBack),
    );
    this.particles.emit(new THREE.Vector3(2.4, 11, -21), { count: 30, color: 0xff3040, color2: 0xffa040, speed: 2.5, life: 0.9, gravity: -3, size: 0.09 });
  }

  private rookSlam() {
    const y0 = 0;
    this.animate(0.35, (k) => (this.rook.position.y = y0 + Math.sin(k * Math.PI) * 1.2), ease.linear).then(() => {
      this.particles.emit(new THREE.Vector3(this.rook.position.x, 0.2, this.rook.position.z), { count: 60, color: 0x8a8090, speed: 3.5, life: 1, gravity: -5, size: 0.08, dir: new THREE.Vector3(0, 0.5, 0), spread: 1.2 });
    });
  }

  protected tick(dt: number) {
    this.queen.rotation.y = Math.sin(this.time * 0.25) * 0.08;
    this.queen.position.y = 1.5 + Math.sin(this.time * 0.6) * 0.06;
    this.rook.rotation.y = 0.5 + Math.sin(this.time * 0.3) * 0.05;
    if (Math.random() < dt * 20) {
      this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 14, 0.1, 10 - Math.random() * 30), {
        count: 1,
        color: 0xd8cfb8,
        speed: 0.1,
        life: 5,
        gravity: 0.08,
        size: 0.035,
      });
    }
    // embers rising from torches
    if (Math.random() < dt * 6) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = 10 - Math.floor(Math.random() * 5) * 8;
      this.particles.emit(new THREE.Vector3(side * 6.35, 4.8, z), { count: 1, color: 0xffa040, speed: 0.4, life: 1.6, gravity: 0.9, size: 0.04 });
    }
  }
}
