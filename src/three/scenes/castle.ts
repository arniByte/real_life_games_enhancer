// Citadel of the Black Queen. You sit at her table under a single hanging lamp;
// she looms across the board, spear in hand. In mirror mode the board is live:
// every move is played (and animated) right here.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1, type PS1Material } from '../ps1';
import * as T from '../textures';
import { blobShadow, candle, chessPiece, flameSprite, lightCone, pillar, wall, type ChessPiece } from '../models';
import type { ChessAnim, ChessHighlight, FxEvent } from '../fx';

/** Table centre (z). */
const CZ = -14;
/** Square size and the board's playing surface height. */
const SQ = 0.36;
const TOP = 1.082;
const PIECE_SCALE = 0.34;

const KIND: Record<string, ChessPiece> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const GRAVE_ORDER = 'qrbnp';

const SEAT = {
  mirror: { pos: new THREE.Vector3(0, 3.75, CZ + 3.3), look: new THREE.Vector3(0, 1.2, CZ - 0.7) },
  /** Phones: the screen is tall and narrow, so look down onto the board. */
  portrait: { pos: new THREE.Vector3(0, 4.5, CZ + 2.9), look: new THREE.Vector3(0, 1.1, CZ - 0.05) },
  real: { pos: new THREE.Vector3(0, 3.05, CZ + 4.7), look: new THREE.Vector3(0, 2.0, CZ - 1.6) },
};

interface PieceObj {
  obj: THREE.Group;
  /** FEN letter: uppercase white, lowercase black. */
  code: string;
  /** Tween token: a newer move cancels the running one. */
  tok: number;
}

type TileLook = 'none' | 'last' | 'hover' | 'target' | 'perk' | 'capture' | 'selected' | 'check';

/** Square name → board-local position of its centre. */
function sqPos(sq: string, y = TOP): THREE.Vector3 {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  return new THREE.Vector3((f - 3.5) * SQ, y, (4.5 - r) * SQ);
}

function parseFen(fen: string): Map<string, string> {
  const out = new Map<string, string>();
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        out.set(`${'abcdefgh'[f]}${8 - i}`, ch);
        f += 1;
      }
    }
  });
  return out;
}

/** 16×16 overlay stamps for square highlights. */
function stamp(kind: 'fill' | 'ring' | 'dot'): THREE.Texture {
  const c = T.makeCanvas(16, 16);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  if (kind === 'fill') {
    ctx.globalAlpha = 0.55;
    ctx.fillRect(1, 1, 14, 14);
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
  } else if (kind === 'ring') {
    for (const [x, y, w, h] of [[0, 0, 5, 2], [0, 0, 2, 5], [11, 0, 5, 2], [14, 0, 2, 5], [0, 14, 5, 2], [0, 11, 2, 5], [11, 14, 5, 2], [14, 11, 2, 5]])
      ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillRect(6, 5, 4, 6);
    ctx.fillRect(5, 6, 6, 4);
  }
  return T.toTexture(c, false);
}

// 3×5 LCD digits for the table clock.
const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
};

export class CastleScene extends BaseScene {
  private queen = new THREE.Group();
  private spear = new THREE.Group();
  private rook = new THREE.Group();
  private eyes: PS1Material[] = [];
  private banners: THREE.Mesh[] = [];
  private spearBase = new THREE.Euler();

  private root = new THREE.Group();
  private surface!: THREE.Mesh;
  private tiles = new Map<string, { mesh: THREE.Mesh; mat: PS1Material; look: TileLook }>();
  private stamps = { fill: stamp('fill'), ring: stamp('ring'), dot: stamp('dot') };
  private pieces = new Map<string, PieceObj>();
  private grave: Record<'w' | 'b', PieceObj[]> = { w: [], b: [] };
  private ivory = ps1({ map: T.bone(), color: new THREE.Color(1.15, 1.08, 0.98) });
  private obsidian = ps1({ map: T.darkMarble(), color: new THREE.Color(2.3, 1.9, 2.8), emissive: 0x2a1446 });

  private fen = '';
  private mirror = true;
  private flipped = false;
  private hl: ChessHighlight = { selected: null, targets: [] };
  private lastMove: { from: string; to: string } | null = null;
  private check: string | null = null;
  private hover: string | null = null;
  private lifted: string | null = null;
  private introDone = false;

  private lamp = new THREE.Group();
  private clock = new THREE.Group();
  private lcd!: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  private clockState = { w: '--:--', b: '--:--', toMove: 'w' as 'w' | 'b', running: false, low: false };
  private buttons: Record<'w' | 'b', THREE.Mesh> = {} as Record<'w' | 'b', THREE.Mesh>;
  private lean = 0;

  build() {
    this.baseFov = 64;
    this.parallax = 0.06;
    this.sway = 0.012;
    this.ambient.setRGB(0.15, 0.12, 0.2);
    this.fogColor.setRGB(0.03, 0.015, 0.05);
    this.fogNear = 7;
    this.fogFar = 30;
    this.clearColor.copy(this.fogColor);
    this.dirColor.setRGB(0.06, 0.05, 0.12);

    this.buildHall();
    this.buildQueen();
    this.buildTable();
    this.buildBoard();
    this.buildClock();

    // Lamp over the table, the Queen's violet aura, two torches in the colonnade.
    this.addLight({ pos: new THREE.Vector3(0, 4, CZ), color: new THREE.Color(1, 0.8, 0.52), intensity: 2.6, range: 7, flicker: 0.12, follow: this.lamp.children[1] });
    this.addLight({ pos: new THREE.Vector3(0, 4.8, CZ - 6.5), color: new THREE.Color(0.6, 0.28, 1), intensity: 2.4, range: 10, flicker: 0.2 });
    this.addLight({ pos: new THREE.Vector3(-6.35, 4.4, CZ), color: new THREE.Color(1, 0.5, 0.2), intensity: 1.6, range: 11, flicker: 1 });
    this.addLight({ pos: new THREE.Vector3(6.35, 4.4, CZ - 8), color: new THREE.Color(1, 0.5, 0.2), intensity: 1.6, range: 11, flicker: 1 });

    this.reconcile('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false);
    this.camera.position.copy(SEAT.mirror.pos);
    this.look.copy(SEAT.mirror.look);
  }

  // ── Set dressing ──────────────────────────────────────────

  private buildHall() {
    const checker = ps1({ map: T.marbleChecker(), uvScale: [8, 12] });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(32, 48, 16, 24), checker);
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
    back.position.set(0, 7, -30);
    this.scene.add(back);
    const ceil = wall(18, 48, ps1({ map: T.woodPlanks(true), uvScale: [6, 16] }), 6, 12);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 13, -6);
    this.scene.add(ceil);

    const pmat = ps1({ map: T.stoneBricks(), uvScale: [2, 4] });
    for (let i = 0; i < 6; i++) {
      const z = 10 - i * 8;
      for (const side of [-1, 1]) {
        const p = pillar(12, 0.55, pmat);
        p.position.set(side * 7, 0, z);
        this.scene.add(p);
        if (i % 2 === 1) {
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

    // Empty throne behind her: she has stepped down to play you.
    const dais = ps1({ map: T.darkMarble(), uvScale: [3, 1] });
    for (let k = 0; k < 3; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(9 - k * 2.2, 0.5, 4 - k * 1), dais);
      step.position.set(0, 0.25 + k * 0.5, CZ - 10 + k * 0.4);
      this.scene.add(step);
    }
    const throne = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), dais);
    seat.position.y = 0.45;
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.4), dais);
    backrest.position.set(0, 2.6, -0.7);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 4), ps1({ map: T.gold(), color: 0xc8a050 }));
    crest.position.set(0, 5.8, -0.7);
    crest.rotation.y = Math.PI / 4;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2, 2, 6), ps1({ map: T.banner('queen', [70, 20, 110]), side: THREE.DoubleSide, wave: 0.03 }));
    cloth.position.set(0, 3, -0.48);
    throne.add(seat, backrest, crest, cloth);
    throne.position.set(0, 1.5, CZ - 10.4);
    this.scene.add(throne);

    // The Rook guardian, off to the left behind her.
    const r = chessPiece('rook', ps1({ map: T.stoneBricks(), color: 0xd8d0c8, uvScale: [3, 2] }), 8);
    r.scale.setScalar(2.6);
    this.rook.add(r);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.13), ps1({ color: 0xffa040, unlit: true, fog: 0.2 }));
    slit.position.set(0, 2.1, 0.63);
    this.rook.add(slit);
    const rs = blobShadow(1.4, 0.6);
    rs.position.y = 0.01;
    this.rook.add(rs);
    this.rook.position.set(-4.4, 0, CZ - 4.6);
    this.rook.rotation.y = 0.55;
    this.scene.add(this.rook);
  }

  private buildQueen() {
    const qMat = ps1({ map: T.darkMarble(), color: new THREE.Color(2.4, 2.1, 3.0), emissive: 0x2c1448 });
    const body = new THREE.Group();
    const q = chessPiece('queen', qMat, 12);
    q.scale.setScalar(5.2);
    body.add(q);
    for (const x of [-0.42, 0.42]) {
      const m = ps1({ color: 0xff2a3a, unlit: true, fog: 0.1 });
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), m);
      e.position.set(x, 5.75, 1.14);
      this.eyes.push(m);
      body.add(e);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 9, 5), ps1({ map: T.woodPlanks(true) }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 4), ps1({ map: T.metal(), emissive: 0x221010 }));
    head.position.y = 5.1;
    const tassel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9, 1, 3), ps1({ color: 0x8a1020, side: THREE.DoubleSide, wave: 0.08 }));
    tassel.position.y = 4.1;
    this.spear.add(shaft, head, tassel);
    this.spear.position.set(2.3, 4.3, 0.6);
    this.spear.rotation.set(0.05, 0, -0.12);
    this.spearBase.copy(this.spear.rotation);
    body.add(this.spear);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 5), qMat);
    arm.position.set(1.4, 4.6, 0.4);
    arm.rotation.z = 1.1;
    body.add(arm);
    body.scale.setScalar(0.62);
    this.queen.add(body);
    const sh = blobShadow(1.6, 0.7);
    sh.position.y = 0.01;
    this.queen.add(sh);
    this.queen.position.set(0, 0, CZ - 3.9);
    this.scene.add(this.queen);
  }

  private buildTable() {
    const wood = ps1({ map: T.woodPlanks(true), color: new THREE.Color(1.25, 1.05, 0.95), uvScale: [3, 2] });
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 4.4, 6, 1, 5), wood);
    top.position.set(0, 0.93, CZ - 0.3);
    this.scene.add(top);
    const legMat = ps1({ map: T.woodPlanks(true), uvScale: [1, 2] });
    for (const x of [-2.4, 2.4])
      for (const z of [1.6, -2.2]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.86, 0.22), legMat);
        leg.position.set(x, 0.43, CZ + z);
        this.scene.add(leg);
      }
    const ts = blobShadow(3.4, 0.65);
    ts.position.set(0, 0.012, CZ - 0.3);
    ts.scale.set(1, 0.85, 1);
    this.scene.add(ts);

    // Candles on the far corners, wax pooled at the base.
    for (const x of [-2.25, 2.3]) {
      const { group } = candle(0.42 + Math.abs(x) * 0.02, 0.06);
      group.position.set(x, 1.0, CZ - 2.1);
      this.scene.add(group);
      const c2 = candle(0.24, 0.05).group;
      c2.position.set(x + (x < 0 ? 0.2 : -0.18), 1.0, CZ - 1.9);
      this.scene.add(c2);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.02, 7), ps1({ map: T.bone(), color: 0xe8dcc0 }));
      pool.position.set(x, 1.01, CZ - 2.05);
      this.scene.add(pool);
    }

    // Hanging lamp: shade, bulb, chain and a cone of dusty light.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 8, 1, true), ps1({ map: T.metal(), color: 0x6a7a6a, side: THREE.DoubleSide }));
    shade.position.y = 0;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), ps1({ color: 0xfff2c8, unlit: true, fog: 0 }));
    bulb.position.y = -0.14;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 9, 3), ps1({ color: 0x302c2a }));
    chain.position.y = 4.7;
    const cone = lightCone(2.1, 3.3, 0xffd9a0, 0.09);
    cone.position.y = -1.78;
    this.lamp.add(shade, bulb, chain, cone);
    this.lamp.position.set(0, 4.5, CZ - 0.1);
    this.scene.add(this.lamp);
  }

  private buildBoard() {
    const frameMats = [
      ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }),
      ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }),
      ps1({ map: T.chessFrame(), color: new THREE.Color(1.2, 1.1, 1.05) }),
      ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }),
      ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }),
      ps1({ map: T.woodPlanks(true), color: 0x8a5a3a }),
    ];
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SQ * 8 + 0.4, 0.08, SQ * 8 + 0.4, 8, 1, 8), frameMats);
    frame.position.y = TOP - 0.052;
    this.root.add(frame);
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 8, SQ * 8, 8, 8), ps1({ map: T.chessSquares(), color: new THREE.Color(1.1, 1.05, 1.05) }));
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = TOP;
    this.root.add(this.surface);

    const tileGeo = new THREE.PlaneGeometry(SQ * 0.94, SQ * 0.94);
    for (let r = 1; r <= 8; r++)
      for (let f = 0; f < 8; f++) {
        const sq = `${'abcdefgh'[f]}${r}`;
        const mat = ps1({ map: this.stamps.fill, unlit: true, transparent: true, depthWrite: false, fog: 0.4 });
        const mesh = new THREE.Mesh(tileGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(sqPos(sq, TOP + 0.014));
        mesh.visible = false;
        mesh.renderOrder = 3;
        this.root.add(mesh);
        this.tiles.set(sq, { mesh, mat, look: 'none' });
      }
    this.root.position.set(0, 0, CZ);
    this.scene.add(this.root);
  }

  private buildClock() {
    const wood = ps1({ map: T.woodPlanks(true), color: 0x9a6a48 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.34), wood);
    body.position.y = 0.21;
    this.clock.add(body);
    const canvas = T.makeCanvas(64, 16);
    const tex = T.toTexture(canvas, false);
    this.lcd = { canvas, tex };
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.28), ps1({ map: tex, unlit: true, fog: 0.3 }));
    face.position.set(0, 0.22, 0.172);
    this.clock.add(face);
    for (const side of ['w', 'b'] as const) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 6), ps1({ map: T.metal(), color: side === 'w' ? 0xe8e0d0 : 0x6a4a8a }));
      btn.position.set(side === 'w' ? -0.34 : 0.34, 0.46, 0);
      this.buttons[side] = btn;
      this.clock.add(btn);
    }
    const sh = blobShadow(0.8, 0.5);
    sh.scale.set(1, 0.4, 1);
    sh.position.y = 0.004;
    this.clock.add(sh);
    this.clock.position.set(0, 1.0, CZ - 2.05);
    this.scene.add(this.clock);
    this.drawClock();
  }

  private drawClock() {
    const { canvas, tex } = this.lcd;
    const ctx = canvas.getContext('2d')!;
    const st = this.clockState;
    const blink = st.low && Math.floor(this.time * 3) % 2 === 0;
    ctx.fillStyle = '#0c140c';
    ctx.fillRect(0, 0, 64, 16);
    for (const side of ['w', 'b'] as const) {
      const x0 = side === 'w' ? 0 : 32;
      const active = st.toMove === side;
      ctx.fillStyle = active ? '#1c2c16' : '#101a10';
      ctx.fillRect(x0 + 1, 1, 30, 14);
      const lit = active ? (st.low ? (blink ? '#ff5040' : '#7a2018') : '#b8ff78') : '#3c5a30';
      const text = (side === 'w' ? st.w : st.b).slice(0, 7);
      const w = text.length * 4 - 1;
      let x = x0 + Math.floor((32 - w) / 2);
      for (const ch of text) {
        const g = GLYPHS[ch] ?? GLYPHS[' '];
        ctx.fillStyle = lit;
        for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(x + (i % 3), 5 + Math.floor(i / 3), 1, 1);
        x += 4;
      }
      // move flag
      ctx.fillStyle = active && st.running ? lit : '#22301c';
      ctx.fillRect(x0 + 3, 2, 3, 1);
    }
    tex.needsUpdate = true;
  }

  // ── Pieces ────────────────────────────────────────────────

  private makePiece(code: string): PieceObj {
    const white = code === code.toUpperCase();
    const kind = KIND[code.toLowerCase()];
    const g = new THREE.Group();
    const p = chessPiece(kind, white ? this.ivory : this.obsidian, 8);
    p.scale.setScalar(PIECE_SCALE);
    if (kind === 'knight') p.rotation.y = white ? -Math.PI / 2 : Math.PI / 2;
    g.add(p);
    const sh = blobShadow(0.19, 0.5);
    sh.position.y = 0.003;
    sh.renderOrder = 2;
    g.add(sh);
    return { obj: g, code, tok: 0 };
  }

  /** Bring the 3D board in line with a FEN, sliding pieces where it can. */
  private reconcile(fen: string, animate: boolean) {
    const want = parseFen(fen);
    const free: PieceObj[] = [];
    for (const [sq, p] of [...this.pieces]) {
      if (want.get(sq) !== p.code) {
        free.push(p);
        this.pieces.delete(sq);
      }
    }
    for (const [sq, code] of want) {
      if (this.pieces.has(sq)) continue;
      const target = sqPos(sq);
      let best = -1;
      let bestD = Infinity;
      free.forEach((p, i) => {
        if (p.code !== code) return;
        const d = p.obj.position.distanceTo(target);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        const p = free.splice(best, 1)[0];
        this.pieces.set(sq, p);
        p.obj.userData.sq = sq;
        if (animate) this.slide(p, target, 0.35);
        else {
          p.tok++;
          p.obj.position.copy(target);
        }
      } else {
        const p = this.makePiece(code);
        p.obj.userData.sq = sq;
        p.obj.position.copy(target);
        this.root.add(p.obj);
        this.pieces.set(sq, p);
        if (animate) this.popIn(p);
      }
    }
    for (const p of free) this.vanish(p, animate);
  }

  private slide(p: PieceObj, to: THREE.Vector3, dur: number) {
    const tok = ++p.tok;
    const from = p.obj.position.clone();
    this.animate(dur, (k) => tok === p.tok && p.obj.position.lerpVectors(from, to, k), ease.outCubic);
  }

  /** Lift, glide, set down: the hand of an invisible player. */
  private hop(p: PieceObj, to: THREE.Vector3, delay = 0): Promise<void> {
    const tok = ++p.tok;
    const from = p.obj.position.clone();
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const knight = p.code.toLowerCase() === 'n';
    const h = (knight ? 0.38 : 0.16) + d * 0.08;
    const dur = 0.32 + d * 0.07;
    return new Promise((resolve) =>
      setTimeout(() => {
        if (tok !== p.tok) return resolve();
        this.animate(
          dur,
          (k) => {
            if (tok !== p.tok) return;
            p.obj.position.lerpVectors(from, to, k);
            p.obj.position.y = to.y + Math.sin(k * Math.PI) * h;
            p.obj.rotation.z = Math.sin(k * Math.PI) * 0.12 * Math.sign(to.x - from.x);
          },
          ease.inOutCubic,
        ).then(() => {
          if (tok !== p.tok) return resolve();
          p.obj.rotation.z = 0;
          this.thud(p.obj.position, p.code === p.code.toUpperCase());
          resolve();
        });
      }, delay * 1000),
    );
  }

  private thud(at: THREE.Vector3, white: boolean) {
    const w = this.root.localToWorld(at.clone());
    this.particles.emit(w.add(new THREE.Vector3(0, 0.02, 0)), { count: 8, color: white ? 0xe8dcc0 : 0x9a62d6, speed: 0.6, life: 0.5, gravity: -1, size: 0.025, radius: 0.1 });
  }

  private popIn(p: PieceObj) {
    const tok = ++p.tok;
    p.obj.scale.setScalar(0.01);
    this.animate(0.45, (k) => tok === p.tok && p.obj.scale.setScalar(Math.max(0.01, k)), ease.outBack);
    const w = this.root.localToWorld(p.obj.position.clone());
    this.particles.emit(w.add(new THREE.Vector3(0, 0.15, 0)), { count: 24, color: 0xffd070, color2: 0xffffff, speed: 1.2, life: 0.9, gravity: 0.5, size: 0.03, radius: 0.12 });
  }

  private vanish(p: PieceObj, animate: boolean) {
    p.tok++;
    if (!animate) {
      p.obj.removeFromParent();
      return;
    }
    const tok = p.tok;
    const y0 = p.obj.position.y;
    this.animate(0.35, (k) => {
      if (tok !== p.tok) return;
      p.obj.scale.setScalar(Math.max(0.01, 1 - k));
      p.obj.position.y = y0 - k * 0.1;
    }, ease.outCubic).then(() => p.obj.removeFromParent());
  }

  /** Where the n-th lost piece of a colour stands beside the board (scene space). */
  private graveSlot(color: 'w' | 'b', i: number): THREE.Vector3 {
    const side = color === 'w' ? -1 : 1;
    return new THREE.Vector3(side * (1.95 + (i % 2) * 0.32), 1.0, CZ + 1.35 - Math.floor(i / 2) * 0.36);
  }

  private reconcileGrave(fen: string, animate: boolean) {
    const want = parseFen(fen);
    for (const color of ['w', 'b'] as const) {
      const lost: string[] = [];
      for (const t of GRAVE_ORDER) {
        const code = color === 'w' ? t.toUpperCase() : t;
        let have = 0;
        for (const c of want.values()) if (c === code) have++;
        for (let i = 0; i < Math.max(0, START_COUNT[t] - have); i++) lost.push(code);
      }
      const cur = this.grave[color].map((p) => p.code).sort().join('');
      if (cur === [...lost].sort().join('')) continue;
      for (const p of this.grave[color]) this.vanish(p, animate);
      this.grave[color] = lost.map((code, i) => {
        const p = this.makePiece(code);
        p.obj.position.copy(this.graveSlot(color, i));
        this.scene.add(p.obj);
        if (animate) this.popIn(p);
        return p;
      });
    }
  }

  /** A taken piece is flung off the board and lands among the fallen. */
  private toGrave(p: PieceObj, delay: number) {
    const color = p.code === p.code.toUpperCase() ? 'w' : 'b';
    const slot = this.graveSlot(color, this.grave[color].length);
    this.grave[color].push(p);
    const tok = ++p.tok;
    setTimeout(() => tok === p.tok && this.fling(p, slot, color), delay * 1000);
  }

  private fling(p: PieceObj, slot: THREE.Vector3, color: 'w' | 'b') {
    this.scene.attach(p.obj);
    const tok = ++p.tok;
    const from = p.obj.position.clone();
    const burst = from.clone().add(new THREE.Vector3(0, 0.2, 0));
    this.particles.emit(burst, { count: 40, color: color === 'w' ? 0xe8dcc0 : 0xb07aff, color2: 0xff3040, speed: 2.2, life: 0.9, gravity: -3, size: 0.04, radius: 0.1 });
    this.animate(
      0.75,
      (k) => {
        if (tok !== p.tok) return;
        p.obj.position.lerpVectors(from, slot, k);
        p.obj.position.y = slot.y + (from.y - slot.y) * (1 - k) + Math.sin(k * Math.PI) * 0.9;
        p.obj.rotation.x = Math.sin(k * Math.PI) * 2.2;
      },
      ease.outCubic,
    ).then(() => {
      if (tok !== p.tok) return;
      p.obj.rotation.x = 0;
      this.particles.emit(slot.clone().add(new THREE.Vector3(0, 0.03, 0)), { count: 10, color: 0x8a7a6a, speed: 0.7, life: 0.5, gravity: -2, size: 0.03 });
    });
  }

  private playAnim(a: ChessAnim) {
    const mover = this.pieces.get(a.from);
    if (a.swap) {
      const other = this.pieces.get(a.to);
      if (mover && other) {
        this.pieces.set(a.to, mover);
        this.pieces.set(a.from, other);
        mover.obj.userData.sq = a.to;
        other.obj.userData.sq = a.from;
        this.hop(mover, sqPos(a.to));
        this.hop(other, sqPos(a.from), 0.08);
      }
      return 0.7;
    }
    if (a.captured && a.capturedAt) {
      const victim = this.pieces.get(a.capturedAt);
      if (victim && victim !== mover) {
        this.pieces.delete(a.capturedAt);
        this.toGrave(victim, 0.22);
        this.strike(this.root.localToWorld(sqPos(a.capturedAt)));
      }
    }
    if (mover && a.from !== a.to) {
      this.pieces.delete(a.from);
      this.pieces.set(a.to, mover);
      mover.obj.userData.sq = a.to;
      this.hop(mover, sqPos(a.to));
    }
    if (a.castle) {
      const rook = this.pieces.get(a.castle.rookFrom);
      if (rook) {
        this.pieces.delete(a.castle.rookFrom);
        this.pieces.set(a.castle.rookTo, rook);
        rook.obj.userData.sq = a.castle.rookTo;
        this.hop(rook, sqPos(a.castle.rookTo), 0.2);
      }
    }
    return a.promotion ? 0.6 : 0;
  }

  // ── Highlights & input ────────────────────────────────────

  private paintTiles() {
    const looks = new Map<string, TileLook>();
    const put = (sq: string | null | undefined, l: TileLook) => sq && looks.set(sq, l);
    if (this.mirror) {
      put(this.lastMove?.from, 'last');
      put(this.lastMove?.to, 'last');
      put(this.hover, 'hover');
      for (const t of this.hl.targets) put(t.square, t.capture ? 'capture' : this.hl.perk ? 'perk' : 'target');
      put(this.hl.selected, 'selected');
      put(this.check, 'check');
    }
    for (const [sq, tile] of this.tiles) {
      const look = looks.get(sq) ?? 'none';
      if (look === tile.look) continue;
      tile.look = look;
      tile.mesh.visible = look !== 'none';
      const u = tile.mat.uniforms;
      const set = (map: THREE.Texture, color: number, opacity: number) => {
        u.uMap.value = map;
        u.uColor.value.set(color);
        u.uOpacity.value = opacity;
      };
      switch (look) {
        case 'last': set(this.stamps.fill, 0xe0a040, 0.45); break;
        case 'hover': set(this.stamps.fill, 0xfff0d0, 0.3); break;
        case 'target': set(this.stamps.dot, 0x8ff0ff, 0.95); break;
        case 'perk': set(this.stamps.dot, 0xd08cff, 0.95); break;
        case 'capture': set(this.stamps.ring, 0xff4a3a, 1); break;
        case 'selected': set(this.stamps.fill, 0xffc23a, 0.7); break;
        case 'check': set(this.stamps.fill, 0xff2030, 0.75); break;
      }
    }
    // Lift the chosen piece off the board a little.
    const sel = this.mirror ? this.hl.selected : null;
    if (sel !== this.lifted) {
      const prev = this.lifted ? this.pieces.get(this.lifted) : null;
      if (prev) this.slide(prev, sqPos(this.lifted!), 0.18);
      this.lifted = sel;
      const p = sel ? this.pieces.get(sel) : null;
      if (p) this.slide(p, sqPos(sel!, TOP + 0.09), 0.18);
    }
  }

  private surfaceSquare(point: THREE.Vector3): string | null {
    const local = this.root.worldToLocal(point.clone());
    const f = Math.floor(local.x / SQ + 4);
    const r = Math.floor(4.5 - local.z / SQ + 0.5);
    if (f < 0 || f > 7 || r < 1 || r > 8) return null;
    return `${'abcdefgh'[f]}${r}`;
  }

  /** The piece under the pointer (or the bare square), plus the board square right beneath the ray. */
  private squareAt(ndc: THREE.Vector2): { square: string; under?: string } | null {
    const objs: THREE.Object3D[] = [this.surface];
    for (const p of this.pieces.values()) objs.push(p.obj);
    const h = this.hit(ndc, objs);
    if (!h) return null;
    const floor = this.hit(ndc, [this.surface]);
    const under = floor ? this.surfaceSquare(floor.point) ?? undefined : undefined;
    let o: THREE.Object3D | null = h.object;
    while (o && o !== this.root) {
      if (o.userData.sq) return { square: o.userData.sq as string, under };
      o = o.parent;
    }
    const sq = this.surfaceSquare(h.point);
    return sq ? { square: sq, under } : null;
  }

  onPointer(type: 'down' | 'move' | 'up', ndc: THREE.Vector2) {
    if (!this.mirror) return;
    const at = this.squareAt(ndc);
    const sq = at?.square ?? null;
    if (type === 'move' || type === 'down') {
      if (sq !== this.hover) {
        this.hover = sq;
        this.emit({ type: 'chess.hover', square: sq });
        this.paintTiles();
      }
    }
    if (type === 'down' && at) this.emit({ type: 'chess.square', square: at.square, under: at.under });
  }

  // ── Camera ────────────────────────────────────────────────

  private portrait = false;

  private seat() {
    if (!this.mirror) return SEAT.real;
    return this.portrait ? SEAT.portrait : SEAT.mirror;
  }

  intro() {
    this.portrait = this.camera.aspect < 0.9;
    this.camera.position.set(0, 2.4, 9);
    this.look.set(0, 2.6, CZ - 4);
    this.flyTo(new THREE.Vector3(0, 2.9, CZ + 6.5), new THREE.Vector3(0, 2.4, CZ - 3), 2.4, ease.inOutCubic).then(() => {
      const s = this.seat();
      this.flyTo(s.pos, s.look, 1.6, ease.inOutCubic).then(() => (this.introDone = true));
    });
  }

  // ── Events from the UI ────────────────────────────────────

  fx(e: FxEvent) {
    switch (e.type) {
      case 'chess.sync': {
        const modeChanged = this.mirror !== e.mirror;
        this.mirror = e.mirror;
        this.parallax = e.mirror ? 0.06 : 0.25;
        this.sway = e.mirror ? 0.012 : 0.04;
        if (modeChanged && this.introDone) {
          const s = this.seat();
          this.flyTo(s.pos, s.look, 1.2);
        }
        if (e.flip !== undefined && e.flip !== this.flipped) {
          this.flipped = e.flip;
          const r0 = this.root.rotation.y;
          const r1 = e.flip ? Math.PI : 0;
          this.animate(0.9, (k) => (this.root.rotation.y = r0 + (r1 - r0) * k), ease.inOutCubic);
        }
        this.lastMove = e.lastMove ?? null;
        const prevCheck = this.check;
        this.check = e.check;
        this.fen = e.fen;
        const lifted = this.lifted ? this.pieces.get(this.lifted) : undefined;
        const liftedTok = lifted?.tok;
        this.lifted = null;
        const delay = e.anim ? this.playAnim(e.anim) : 0;
        const settle = () => {
          this.reconcile(this.fen, true);
          this.reconcileGrave(this.fen, !e.anim);
        };
        if (delay) setTimeout(settle, delay * 1000);
        else settle();
        if (lifted && lifted.tok === liftedTok && lifted.obj.parent === this.root) this.slide(lifted, sqPos(lifted.obj.userData.sq), 0.18);
        if (e.check && e.check !== prevCheck && e.anim) this.checkReaction();
        this.paintTiles();
        break;
      }
      case 'chess.highlight':
        this.hl = e.hl;
        this.paintTiles();
        if (e.hl.selected) {
          const at = this.root.localToWorld(sqPos(e.hl.selected, TOP + 0.05));
          this.particles.emit(at, { count: 6, color: 0xffc23a, speed: 0.4, life: 0.6, gravity: 0.6, size: 0.025, radius: 0.08 });
        }
        break;
      case 'chess.clock': {
        const prev = this.clockState.toMove;
        this.clockState = { w: e.w, b: e.b, toMove: e.toMove, running: e.running, low: e.low };
        if (prev !== e.toMove) this.pressClock(prev);
        this.drawClock();
        break;
      }
      case 'chess.view':
        this.fx({ type: 'chess.sync', fen: this.fen, check: this.check, mirror: this.mirror, flip: e.side === 'b', lastMove: this.lastMove ?? undefined });
        break;
      case 'chess.capture':
        if (!this.mirror) this.strike(new THREE.Vector3((Math.random() - 0.5) * 2, TOP + 0.2, CZ + (Math.random() - 0.5) * 2));
        break;
      case 'chess.check':
        if (!this.mirror) this.checkReaction();
        break;
      case 'chess.move':
        if (!this.mirror) this.pressClock(e.side);
        break;
      case 'win':
        this.strike(new THREE.Vector3(0, TOP + 0.3, CZ));
        for (let i = 0; i < 6; i++)
          setTimeout(
            () =>
              this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 2, CZ - 2 - Math.random() * 4), {
                count: 60,
                color: e.color ?? 0xffd070,
                color2: 0xffffff,
                speed: 3,
                life: 1.8,
                gravity: -2.5,
                size: 0.06,
              }),
            i * 350,
          );
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, TOP + 0.4, CZ), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.2, life: 1.6, gravity: 1.2, size: 0.04, radius: 0.8 });
        break;
    }
  }

  private pressClock(side: 'w' | 'b') {
    const btn = this.buttons[side];
    if (!btn) return;
    this.animate(0.12, (k) => (btn.position.y = 0.46 - k * 0.06), ease.outCubic).then(() =>
      this.animate(0.3, (k) => (btn.position.y = 0.4 + k * 0.06), ease.outBack),
    );
    const y0 = this.clock.position.y;
    this.animate(0.25, (k) => (this.clock.position.y = y0 + Math.sin(k * Math.PI) * 0.02), ease.linear);
  }

  private checkReaction() {
    this.lean = 1;
    this.rookSlam();
    this.eyes.forEach((m) => m.uniforms.uColor.value.set(0xffffff));
    setTimeout(() => this.eyes.forEach((m) => m.uniforms.uColor.value.set(0xff2a3a)), 700);
  }

  private strike(at: THREE.Vector3) {
    this.animate(0.2, (k) => (this.spear.rotation.x = this.spearBase.x + k * 0.55), ease.outCubic).then(() =>
      this.animate(0.7, (k) => (this.spear.rotation.x = this.spearBase.x + 0.55 * (1 - k)), ease.outBack),
    );
    this.particles.emit(at, { count: 30, color: 0xff3040, color2: 0xffa040, speed: 1.8, life: 0.8, gravity: -3, size: 0.04, radius: 0.05 });
  }

  private rookSlam() {
    this.animate(0.35, (k) => (this.rook.position.y = Math.sin(k * Math.PI) * 0.8), ease.linear).then(() => {
      this.particles.emit(new THREE.Vector3(this.rook.position.x, 0.2, this.rook.position.z), {
        count: 50,
        color: 0x8a8090,
        speed: 2.5,
        life: 1,
        gravity: -5,
        size: 0.06,
        dir: new THREE.Vector3(0, 0.5, 0),
        spread: 1.2,
      });
    });
  }

  protected tick(dt: number) {
    const t = this.time;
    const portrait = this.camera.aspect < 0.9;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      if (this.introDone) {
        const s = this.seat();
        this.flyTo(s.pos, s.look, 0.8);
      }
    }
    // She breathes, watches the square you hover, and leans in on check.
    this.lean = Math.max(0, this.lean - dt * 0.8);
    const hoverX = this.hover ? (this.hover.charCodeAt(0) - 100.5) * (this.flipped ? -1 : 1) : 0;
    this.queen.rotation.y += (Math.sin(t * 0.25) * 0.06 + hoverX * 0.025 - this.queen.rotation.y) * Math.min(1, dt * 2);
    this.queen.rotation.x = Math.sin(this.lean * Math.PI) * 0.12;
    this.queen.position.y = Math.sin(t * 0.6) * 0.03;
    this.rook.rotation.y = 0.55 + Math.sin(t * 0.3) * 0.05;
    this.lamp.rotation.z = Math.sin(t * 0.7) * 0.025;
    this.lamp.rotation.x = Math.sin(t * 0.53 + 1) * 0.015;

    // Pulse selection and check.
    for (const tile of this.tiles.values()) {
      if (tile.look === 'selected') tile.mat.uniforms.uOpacity.value = 0.55 + Math.sin(t * 6) * 0.2;
      if (tile.look === 'check') tile.mat.uniforms.uOpacity.value = 0.55 + Math.sin(t * 9) * 0.3;
    }
    if (this.lifted) {
      const p = this.pieces.get(this.lifted);
      if (p) p.obj.rotation.y = Math.sin(t * 2.5) * 0.15;
    }
    if (this.clockState.low) this.drawClock();

    // Dust drifting through the lamp light.
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.4;
      this.particles.emit(new THREE.Vector3(Math.cos(a) * r, 1.3 + Math.random() * 1.8, CZ + Math.sin(a) * r), {
        count: 1,
        color: 0xffe0b0,
        speed: 0.04,
        life: 4,
        gravity: -0.02,
        size: 0.02,
      });
    }
    if (Math.random() < dt * 4) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = 10 - Math.floor(Math.random() * 6) * 8;
      this.particles.emit(new THREE.Vector3(side * 6.35, 4.8, z), { count: 1, color: 0xffa040, speed: 0.4, life: 1.6, gravity: 0.9, size: 0.04 });
    }
  }
}
