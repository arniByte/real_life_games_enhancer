// Tavern «The Crooked Dart»: you stand at the oche. Darts land where the scorekeeper
// says — or where you tap the board. The chalkboard keeps the score, the neon buzzes.

import * as THREE from 'three';
import { BaseScene, ease, type LightSlot } from './base';
import { ps1, type PS1Material } from '../ps1';
import * as T from '../textures';
import { blobShadow, candle, dart, flameSprite, lightCone, wall } from '../models';
import type { FxEvent } from '../fx';

const BOARD_POS = new THREE.Vector3(0, 2.25, -5.85);
const PLAY_R = 0.95;
const DART_COLORS = [0xd9433b, 0xe8a33d, 0x7fb24a, 0x4a86d9, 0x9a62d6];

const SEAT = {
  wide: { pos: new THREE.Vector3(-1.1, 2.35, -0.8), look: new THREE.Vector3(-1.1, 2.3, -5.85) },
  /** Phones: step up to the board so it fills the narrow screen. */
  portrait: { pos: new THREE.Vector3(0, 2.15, -2.2), look: new THREE.Vector3(0, 2.2, -5.85) },
};

type ScoreBoard = Extract<FxEvent, { type: 'darts.score' }>;

/** Board-local hit (x, y in units of the playing radius) → sector and ring. */
export function readBoard(x: number, y: number): { n: number; m: 1 | 2 | 3 } {
  const R = T.DART_RINGS;
  const r = Math.hypot(x, y);
  if (r > R.doubleOut) return { n: 0, m: 1 };
  if (r <= R.bull) return { n: 25, m: 2 };
  if (r <= R.outerBull) return { n: 25, m: 1 };
  const a = (Math.atan2(x, y) + Math.PI * 2) % (Math.PI * 2);
  const n = T.DART_ORDER[Math.round(a / ((Math.PI * 2) / 20)) % 20];
  const m = r >= R.doubleIn ? 2 : r >= R.tripleIn && r <= R.tripleOut ? 3 : 1;
  return { n, m };
}

const aimLabel = (n: number, m: number) => (n === 0 ? 'мимо' : n === 25 ? (m === 2 ? '50' : '25') : `${m === 3 ? 'T' : m === 2 ? 'D' : ''}${n}`);

export class TavernScene extends BaseScene {
  private board = new THREE.Group();
  private darts: THREE.Group[] = [];
  private lantern = new THREE.Group();
  private fire = new THREE.Group();
  private face!: THREE.Mesh;
  private reticle!: THREE.Mesh;
  private chalk!: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  private neon!: PS1Material;
  private neonGlow!: PS1Material;
  private neonFlicker = 0;
  private neonLight!: LightSlot;
  private score: ScoreBoard | null = null;
  private aim: string | null = null;
  private portrait = false;
  private introDone = false;

  build() {
    this.baseFov = 55;
    this.parallax = 0.08;
    this.sway = 0.015;
    this.ambient.setRGB(0.2, 0.13, 0.1);
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
    this.face = face;
    this.board.add(face);
    this.reticle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      ps1({ map: reticleTex(), unlit: true, transparent: true, additive: true, depthWrite: false, fog: 0, color: 0x9ff0ff }),
    );
    this.reticle.position.z = 0.05;
    this.reticle.visible = false;
    this.board.add(this.reticle);
    this.board.position.copy(BOARD_POS);
    this.scene.add(this.board);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 6, 1, true), ps1({ map: T.metal(), side: THREE.DoubleSide }));
    lamp.position.set(0, 4.5, -4.7);
    lamp.rotation.x = 0.45;
    this.scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), ps1({ color: 0xfff0c0, unlit: true, fog: 0 }));
    bulb.position.set(0, 4.36, -4.77);
    this.scene.add(bulb);
    const beam = lightCone(1.5, 2.3, 0xffe2b0, 0.11);
    beam.position.set(0, 3.33, -5.3);
    beam.rotation.x = 0.48;
    this.scene.add(beam);

    this.buildChalkboard();
    this.buildNeon();
    this.buildBar();

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
    // Neon spill on the wall and floor.
    this.neonLight = this.addLight({ pos: new THREE.Vector3(-2.9, 3.4, -5.2), color: new THREE.Color(1, 0.3, 0.62), intensity: 1.4, range: 5.5 });

    this.camera.position.copy(SEAT.wide.pos);
    this.look.copy(SEAT.wide.look);
  }

  private seat() {
    return this.portrait ? SEAT.portrait : SEAT.wide;
  }

  intro() {
    this.portrait = this.camera.aspect < 0.9;
    this.camera.position.set(3.5, 2.6, 6.5);
    this.look.set(6, 1.6, -1);
    this.flyTo(new THREE.Vector3(1.2, 2.1, 3.8), new THREE.Vector3(-3, 1.6, -4), 2.2, ease.inOutCubic).then(() => {
      const s = this.seat();
      this.flyTo(s.pos, s.look, 2, ease.inOutCubic).then(() => (this.introDone = true));
    });
  }

  // ── Set dressing ──────────────────────────────────────────

  private buildChalkboard() {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.9, 0.08), ps1({ map: T.woodPlanks(true), color: 0x9a6a48 }));
    frame.position.set(-2.9, 2.3, -5.92);
    this.scene.add(frame);
    // Texel ≈ screen pixel at the default 240p: any bigger and the chalk would blur into mush.
    const canvas = T.makeCanvas(64, 48);
    const tex = T.toTexture(canvas, false);
    this.chalk = { canvas, tex };
    const slate = new THREE.Mesh(new THREE.PlaneGeometry(2.32, 1.74, 4, 3), ps1({ map: tex, unlit: true, fog: 0.4, color: new THREE.Color(0.95, 0.92, 0.85) }));
    slate.position.set(-2.9, 2.3, -5.87);
    this.scene.add(slate);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.14), ps1({ map: T.woodPlanks(true) }));
    tray.position.set(-2.9, 1.33, -5.82);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), ps1({ color: 0xf0ece0 }));
    stick.position.set(-2.35, 1.37, -5.8);
    this.scene.add(tray, stick);
    this.drawChalk();
    document.fonts?.load('8px Tiny5').then(() => this.drawChalk()).catch(() => {});
  }

  private drawChalk() {
    const { canvas, tex } = this.chalk;
    const ctx = canvas.getContext('2d')!;
    const W = 64;
    const H = 48;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    ctx.fillStyle = '#18201c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#202a25' : '#131a16';
      ctx.fillRect((rnd() * W) | 0, (rnd() * H) | 0, 1 + ((rnd() * 4) | 0), 1);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(200,200,190,0.06)';
      ctx.fillRect((rnd() * W) | 0, (rnd() * H) | 0, 6 + ((rnd() * 14) | 0), 1 + ((rnd() * 3) | 0));
    }
    // Text goes on a scratch layer, then is thresholded into hard chalk pixels.
    const layer = T.makeCanvas(W, H);
    const lc = layer.getContext('2d')!;
    lc.font = '8px Tiny5, monospace';
    lc.textBaseline = 'top';
    const put = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
      lc.fillStyle = color;
      lc.textAlign = align;
      lc.fillText(text, x, y);
    };
    const sc = this.score;
    if (!sc) {
      put('ДАРТС', W / 2, 12, '#e8e4d8', 'center');
      put('ЭЛЬ 2', W / 2, 24, '#c8c4b8', 'center');
    } else {
      put(sc.title.toUpperCase().slice(0, 12), W / 2, 1, '#c8c4b8', 'center');
      lc.fillStyle = '#a8a498';
      lc.fillRect(3, 10, W - 6, 1);
      sc.rows.slice(0, 4).forEach((r, i) => {
        const y = 12 + i * 9;
        if (r.active) {
          lc.fillStyle = '#ffe08a';
          lc.fillRect(1, y + 2, 2, 3);
        }
        put(r.name.toUpperCase().slice(0, 6), 5, y, r.active ? r.color : '#d8d4c8');
        put(r.score, W - 2, y, r.active ? '#ffe08a' : '#e8e4d8', 'right');
      });
    }
    const img = lc.getImageData(0, 0, W, H);
    const out = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 110 || rnd() < 0.08) continue;
      const k = 0.8 + rnd() * 0.2;
      out.data[i] = img.data[i] * k;
      out.data[i + 1] = img.data[i + 1] * k;
      out.data[i + 2] = img.data[i + 2] * k;
    }
    ctx.putImageData(out, 0, 0);
    tex.needsUpdate = true;
  }

  private buildNeon() {
    const canvas = T.makeCanvas(40, 22);
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.clearRect(0, 0, 40, 22);
      const layer = T.makeCanvas(40, 22);
      const lc = layer.getContext('2d')!;
      lc.font = '8px Tiny5, monospace';
      lc.textAlign = 'center';
      lc.textBaseline = 'top';
      lc.fillStyle = '#fff';
      lc.fillText('КРИВОЙ', 20, 1);
      lc.fillText('ДРОТИК', 20, 11);
      lc.fillRect(2, 20, 36, 1);
      const img = lc.getImageData(0, 0, 40, 22);
      const out = ctx.createImageData(40, 22);
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] < 110) continue;
        out.data[i] = 255;
        out.data[i + 1] = 255;
        out.data[i + 2] = 255;
        out.data[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      tex.needsUpdate = true;
    };
    const tex = T.toTexture(canvas, false);
    draw();
    document.fonts?.load('8px Tiny5').then(draw).catch(() => {});
    this.neon = ps1({ map: tex, unlit: true, transparent: true, additive: true, depthWrite: false, fog: 0.2, color: 0xff4fa8 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.82), this.neon);
    sign.position.set(-2.9, 3.85, -5.9);
    sign.renderOrder = 4;
    this.neonGlow = ps1({ map: tex, unlit: true, transparent: true, additive: true, depthWrite: false, fog: 0.2, color: 0x6a1840, opacity: 0.8 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.92), this.neonGlow);
    glow.position.set(-2.9, 3.85, -5.91);
    glow.renderOrder = 3;
    this.scene.add(glow, sign);
  }

  private buildBar() {
    const wood = ps1({ map: T.woodPlanks(true), color: 0xb07850, uvScale: [4, 1] });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1, 1.15, 5.4), wood);
    counter.position.set(5.6, 0.575, 1.6);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 5.6), ps1({ map: T.woodPlanks(), color: 0xc89060, uvScale: [4, 1] }));
    top.position.set(5.5, 1.19, 1.6);
    this.scene.add(counter, top);
    const shelfMat = ps1({ map: T.woodPlanks(true) });
    const bottleCols = [0x2f6a3a, 0x7a3a18, 0x3a4a8a, 0xb0a040, 0x6a1a2a, 0x2a5a5a];
    for (const y of [2.0, 2.7]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 4.6), shelfMat);
      shelf.position.set(6.8, y, 1.4);
      this.scene.add(shelf);
      for (let i = 0; i < 9; i++) {
        const c = bottleCols[(i * 7 + (y > 2.5 ? 3 : 0)) % bottleCols.length];
        const h = 0.34 + ((i * 13) % 5) * 0.03;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 6), ps1({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.25) }));
        b.position.set(6.78, y + 0.025 + h / 2, -0.5 + i * 0.46);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 5), ps1({ color: c }));
        neck.position.set(6.78, y + h + 0.08, -0.5 + i * 0.46);
        this.scene.add(b, neck);
      }
    }
    for (const z of [0, 1.5, 3]) {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 7), ps1({ color: 0x5a2a1a }));
      seat.position.set(4.7, 0.95, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 5), ps1({ map: T.metal() }));
      leg.position.set(4.7, 0.47, z);
      const sh = blobShadow(0.35, 0.5);
      sh.position.set(4.7, 0.01, z);
      this.scene.add(seat, leg, sh);
    }
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.24, 6), ps1({ map: T.metal(), color: 0xc0a080 }));
    mug.position.set(5.3, 1.35, 0.4);
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 6), ps1({ color: 0xf8f0d8 }));
    foam.position.set(5.3, 1.49, 0.4);
    this.scene.add(mug, foam);
    const sh = blobShadow(2.2, 0.5);
    sh.scale.set(0.5, 1.4, 1);
    sh.position.set(5.6, 0.01, 1.6);
    this.scene.add(sh);
  }

  // ── Tap the board ─────────────────────────────────────────

  private boardHit(ndc: THREE.Vector2): { x: number; y: number } | null {
    const h = this.hit(ndc, [this.face]);
    if (!h) return null;
    const local = this.board.worldToLocal(h.point.clone());
    return { x: local.x / PLAY_R, y: local.y / PLAY_R };
  }

  onPointer(type: 'down' | 'move' | 'up', ndc: THREE.Vector2) {
    const at = this.boardHit(ndc);
    if (type === 'move') {
      this.reticle.visible = !!at;
      if (at) this.reticle.position.set(at.x * PLAY_R, at.y * PLAY_R, 0.05);
      const r = at ? readBoard(at.x, at.y) : null;
      const label = r ? aimLabel(r.n, r.m) : null;
      if (label !== this.aim) {
        this.aim = label;
        this.emit(r ? { type: 'darts.aim', n: r.n, m: r.m } : { type: 'darts.aimOff' });
      }
    }
    if (type === 'down' && at) {
      const r = readBoard(at.x, at.y);
      this.emit({ type: 'darts.board', n: r.n, m: r.m, at });
    }
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

  private throwDart(n: number, m: number, at?: { x: number; y: number }) {
    const d = dart(DART_COLORS[this.darts.length % DART_COLORS.length]);
    d.scale.setScalar(1.6);
    const target = at ? new THREE.Vector3(BOARD_POS.x + at.x * PLAY_R, BOARD_POS.y + at.y * PLAY_R, BOARD_POS.z + 0.02) : this.hitPoint(n, m);
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
        this.throwDart(e.n, e.m, e.at);
        break;
      case 'darts.score':
        this.score = e;
        this.drawChalk();
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
    const portrait = this.camera.aspect < 0.9;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      if (this.introDone) {
        const s = this.seat();
        this.flyTo(s.pos, s.look, 0.8);
      }
    }
    // The neon buzzes and now and then drops out for a few frames.
    if (this.neonFlicker > 0) this.neonFlicker -= dt;
    else if (Math.random() < dt * 0.25) this.neonFlicker = 0.05 + Math.random() * 0.25;
    const on = this.neonFlicker > 0 ? (Math.random() < 0.5 ? 0.15 : 0.7) : 0.92 + Math.sin(this.time * 50) * 0.04;
    this.neon.uniforms.uOpacity.value = on;
    this.neonGlow.uniforms.uOpacity.value = on * 0.8;
    this.neonLight.intensity = 1.5 * on;
    this.reticle.rotation.z += dt * 1.5;
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

function reticleTex(): THREE.Texture {
  const c = T.makeCanvas(16, 16);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  for (const [x, y, w, h] of [[7, 0, 2, 5], [7, 11, 2, 5], [0, 7, 5, 2], [11, 7, 5, 2], [7, 7, 2, 2]]) ctx.fillRect(x, y, w, h);
  return T.toTexture(c, false);
}
