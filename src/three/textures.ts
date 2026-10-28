// Procedural low-res textures drawn on canvas. No image assets — everything is
// generated at runtime, cached, and sampled with nearest filtering for the PS1 look.

import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function make(key: string, w: number, h: number, draw: Draw, repeat = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h, seeded(key.length * 7919 + key.charCodeAt(0) * 31));
  const t = toTexture(c, repeat);
  cache.set(key, t);
  return t;
}

const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

/** Per-pixel noise multiply over the current canvas. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 1 + (rnd() * 2 - 1) * amount;
    img.data[i] = Math.min(255, img.data[i] * n);
    img.data[i + 1] = Math.min(255, img.data[i + 1] * n);
    img.data[i + 2] = Math.min(255, img.data[i + 2] * n);
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, color: string, alpha: number, size: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const s = 1 + rnd() * size;
    ctx.fillRect(x | 0, y | 0, s | 0, (s * (0.5 + rnd())) | 0);
  }
  ctx.restore();
}

// ── Surfaces ─────────────────────────────────────────────────

export const stoneBricks = () =>
  make('stone', 64, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(28, 25, 32);
    ctx.fillRect(0, 0, w, h);
    const bw = 16;
    const bh = 8;
    for (let row = 0; row < h / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < w / bw + 1; col++) {
        const v = 62 + rnd() * 26;
        const tint = rnd() * 8;
        ctx.fillStyle = rgb(v + tint, v - 4, v + 6 + tint);
        ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 1, bh - 1);
        ctx.fillStyle = rgb(v + 18, v + 14, v + 22);
        ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 1, 1);
      }
    }
    blotches(ctx, w, h, rnd, 30, rgb(40, 60, 35), 0.35, 3);
    grain(ctx, w, h, rnd, 0.18);
  });

export const flagstone = () =>
  make('flag', 64, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(20, 18, 24);
    ctx.fillRect(0, 0, w, h);
    const slabs = [
      [0, 0, 30, 22],
      [31, 0, 33, 30],
      [0, 23, 20, 41],
      [21, 23, 22, 18],
      [44, 31, 20, 33],
      [21, 42, 22, 22],
    ];
    for (const [x, y, sw, sh] of slabs) {
      const v = 50 + rnd() * 20;
      ctx.fillStyle = rgb(v, v - 3, v + 4);
      ctx.fillRect(x + 1, y + 1, sw - 2, sh - 2);
      ctx.fillStyle = rgb(v + 14, v + 11, v + 17);
      ctx.fillRect(x + 1, y + 1, sw - 2, 1);
    }
    grain(ctx, w, h, rnd, 0.22);
  });

export const marbleChecker = () =>
  make('checker', 64, 64, (ctx, w, h, rnd) => {
    const sq = 32;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const light = (x + y) % 2 === 0;
        ctx.fillStyle = light ? rgb(196, 186, 168) : rgb(26, 22, 32);
        ctx.fillRect(x * sq, y * sq, sq, sq);
        // veins
        ctx.fillStyle = light ? rgb(150, 140, 135) : rgb(70, 40, 90);
        for (let v = 0; v < 3; v++) {
          let px = x * sq + rnd() * sq;
          let py = y * sq;
          for (let i = 0; i < sq; i++) {
            ctx.fillRect(px | 0, py | 0, 1, 1);
            px += rnd() * 2 - 1;
            py += 1;
            if (px < x * sq) px = x * sq;
            if (px > x * sq + sq - 1) px = x * sq + sq - 1;
          }
        }
        ctx.fillStyle = light ? 'rgba(255,255,255,0.25)' : 'rgba(160,120,200,0.18)';
        ctx.fillRect(x * sq, y * sq, sq, 1);
        ctx.fillRect(x * sq, y * sq, 1, sq);
      }
    grain(ctx, w, h, rnd, 0.08);
  });

export const woodPlanks = (dark = false) =>
  make(dark ? 'woodDark' : 'wood', 64, 64, (ctx, w, h, rnd) => {
    const pw = 16;
    for (let i = 0; i < w / pw; i++) {
      const base = dark ? 40 + rnd() * 14 : 92 + rnd() * 26;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < pw; x++) {
          const g = Math.sin((x + i * 3) * 0.9 + Math.sin(y * 0.15 + i) * 2.2) * 0.12 + 1;
          const v = base * g;
          ctx.fillStyle = rgb(v * 1.05, v * 0.68, v * 0.4);
          ctx.fillRect(i * pw + x, y, 1, 1);
        }
      }
      ctx.fillStyle = dark ? rgb(14, 8, 6) : rgb(36, 20, 12);
      ctx.fillRect(i * pw, 0, 1, h);
      const cut = (rnd() * h) | 0;
      ctx.fillRect(i * pw, cut, pw, 1);
      // knot
      ctx.fillStyle = dark ? rgb(22, 12, 8) : rgb(60, 34, 18);
      ctx.fillRect(i * pw + 4 + ((rnd() * 8) | 0), (rnd() * h) | 0, 3, 2);
    }
    grain(ctx, w, h, rnd, 0.1);
  });

export const felt = (hue: 'green' | 'red' = 'green') =>
  make(`felt-${hue}`, 32, 32, (ctx, w, h, rnd) => {
    ctx.fillStyle = hue === 'green' ? rgb(24, 84, 48) : rgb(110, 20, 28);
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, rnd, 0.2);
  });

export const damask = () =>
  make('damask', 64, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(52, 14, 22);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(80, 26, 34);
    const motif = (cx: number, cy: number) => {
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(cx - i, cy - 8 + i, i * 2 + 1, 1);
        ctx.fillRect(cx - i, cy + 8 - i, i * 2 + 1, 1);
      }
      ctx.fillStyle = rgb(110, 40, 40);
      ctx.fillRect(cx - 1, cy - 3, 3, 7);
      ctx.fillStyle = rgb(80, 26, 34);
    };
    motif(16, 16);
    motif(48, 48);
    motif(48, 16 - 32 + 64);
    ctx.fillStyle = rgb(30, 8, 12);
    ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(32, 0, 1, h);
    grain(ctx, w, h, rnd, 0.12);
  });

export const concrete = () =>
  make('concrete', 64, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(78, 80, 82);
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 60, rgb(50, 52, 50), 0.4, 6);
    blotches(ctx, w, h, rnd, 30, rgb(60, 50, 40), 0.3, 8);
    ctx.fillStyle = rgb(40, 40, 42);
    let x = rnd() * w;
    for (let y = 0; y < h; y++) {
      ctx.fillRect(x | 0, y, 1, 1);
      x += rnd() * 2 - 1;
    }
    ctx.fillRect(0, 31, w, 1);
    grain(ctx, w, h, rnd, 0.2);
  });

export const tiles = () =>
  make('tiles', 64, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(30, 34, 32);
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = 70 + rnd() * 20;
        ctx.fillStyle = rgb(v * 0.85, v, v * 0.92);
        ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
    blotches(ctx, w, h, rnd, 20, rgb(40, 30, 20), 0.35, 5);
    grain(ctx, w, h, rnd, 0.15);
  });

export const metal = () =>
  make('metal', 32, 32, (ctx, w, h, rnd) => {
    for (let y = 0; y < h; y++) {
      const v = 70 + rnd() * 30;
      ctx.fillStyle = rgb(v, v, v + 6);
      ctx.fillRect(0, y, w, 1);
    }
    grain(ctx, w, h, rnd, 0.1);
  });

export const gold = () =>
  make('gold', 32, 32, (ctx, w, h, rnd) => {
    for (let y = 0; y < h; y++) {
      const v = 150 + Math.sin(y * 0.6) * 50 + rnd() * 20;
      ctx.fillStyle = rgb(v * 1.1, v * 0.82, v * 0.3);
      ctx.fillRect(0, y, w, 1);
    }
    grain(ctx, w, h, rnd, 0.12);
  });

export const bone = () =>
  make('bone', 32, 32, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(206, 196, 170);
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 20, rgb(150, 130, 100), 0.4, 3);
    grain(ctx, w, h, rnd, 0.1);
  });

export const darkMarble = () =>
  make('darkMarble', 32, 32, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(28, 24, 34);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(80, 50, 110);
    let x = rnd() * w;
    for (let y = 0; y < h; y++) {
      ctx.fillRect(x | 0, y, 1, 1);
      x = (x + rnd() * 3 - 1.5 + w) % w;
    }
    grain(ctx, w, h, rnd, 0.1);
  });

export const banner = (emblem: 'queen' | 'eye' = 'queen', color = [120, 16, 24]) =>
  make(`banner-${emblem}-${color.join()}`, 32, 64, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(color[0], color[1], color[2]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(190, 150, 50);
    ctx.fillRect(2, 0, 1, h - 8);
    ctx.fillRect(w - 3, 0, 1, h - 8);
    // swallow-tail cut
    ctx.clearRect(0, h - 8, w, 8);
    ctx.fillStyle = rgb(color[0], color[1], color[2]);
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(0, h - 8 + i, w / 2 - i * 2, 1);
      ctx.fillRect(w / 2 + i * 2, h - 8 + i, w / 2 - i * 2, 1);
    }
    ctx.fillStyle = rgb(210, 170, 60);
    if (emblem === 'queen') {
      // crown + body silhouette
      const cx = w / 2;
      ctx.fillRect(cx - 6, 14, 2, 4);
      ctx.fillRect(cx - 1, 12, 2, 6);
      ctx.fillRect(cx + 4, 14, 2, 4);
      ctx.fillRect(cx - 6, 18, 12, 3);
      ctx.fillRect(cx - 3, 21, 6, 10);
      ctx.fillRect(cx - 5, 31, 10, 3);
      ctx.fillRect(cx - 7, 34, 14, 3);
    } else {
      const cx = w / 2;
      ctx.fillRect(cx - 8, 26, 16, 2);
      ctx.fillRect(cx - 6, 24, 12, 6);
      ctx.fillStyle = rgb(20, 10, 10);
      ctx.fillRect(cx - 2, 25, 4, 4);
    }
    grain(ctx, w, h, rnd, 0.15);
  });

export const stars = () =>
  make('stars', 512, 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(4, 3, 8);
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 60, rgb(40, 10, 60), 0.1, 60);
    blotches(ctx, w, h, rnd, 40, rgb(10, 30, 60), 0.1, 48);
    for (let i = 0; i < 220; i++) {
      const bright = rnd() < 0.12;
      const v = bright ? 200 + rnd() * 55 : 60 + rnd() * 80;
      ctx.fillStyle = rgb(v, v, v * (0.85 + rnd() * 0.3));
      ctx.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 1, 1);
    }
  });

export const runeRing = () =>
  make(
    'runes',
    128,
    128,
    (ctx, w, h, rnd) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      ctx.strokeStyle = 'rgb(160,90,255)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cx, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cx, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgb(120,220,255)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = cx + Math.cos(a) * 52;
        const y = cx + Math.sin(a) * 52;
        for (let k = 0; k < 4; k++) ctx.fillRect((x + rnd() * 6 - 3) | 0, (y + rnd() * 6 - 3) | 0, 1 + ((rnd() * 2) | 0), 2);
      }
      // pentagram
      ctx.strokeStyle = 'rgba(160,90,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const x = cx + Math.cos(a) * 40;
        const y = cx + Math.sin(a) * 40;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    false,
  );

export const flame = () =>
  make(
    'flame',
    16,
    32,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const width = Math.sin(t * Math.PI) * (w / 2) * (0.4 + t * 0.6);
        const r = 255;
        const g = 90 + t * 160;
        const b = 30 + t * t * 160;
        ctx.fillStyle = rgb(r, g, b);
        ctx.fillRect((w / 2 - width) | 0, y, Math.max(1, (width * 2) | 0), 1);
      }
      ctx.fillStyle = 'rgb(255,250,220)';
      ctx.fillRect(w / 2 - 2, h - 12, 4, 7);
    },
    false,
  );

export const fence = () =>
  make('fence', 32, 32, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(140,140,130)';
    for (let i = 0; i < w; i++) {
      ctx.fillRect(i, i % 16, 1, 1);
      ctx.fillRect(i, 15 - (i % 16), 1, 1);
      ctx.fillRect(i, 16 + (i % 16), 1, 1);
      ctx.fillRect(i, 31 - (i % 16), 1, 1);
    }
  });

export const pingTable = () =>
  make(
    'pingTable',
    128,
    64,
    (ctx, w, h, rnd) => {
      ctx.fillStyle = rgb(22, 60, 120);
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, rnd, 0.1);
      ctx.fillStyle = rgb(230, 230, 220);
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(w - 2, 0, 2, h);
      ctx.fillRect(0, h / 2, w, 1);
    },
    false,
  );

export const parchment = () =>
  make('parchment', 32, 48, (ctx, w, h, rnd) => {
    ctx.fillStyle = rgb(196, 170, 120);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(70, 40, 20);
    ctx.fillRect(4, 4, w - 8, 4);
    for (let y = 14; y < h - 6; y += 4) ctx.fillRect(4, y, 6 + rnd() * (w - 12), 1);
    ctx.fillStyle = rgb(130, 30, 20);
    ctx.fillRect(w / 2 - 5, 18, 10, 10);
    grain(ctx, w, h, rnd, 0.15);
  });

export const graffiti = () =>
  make('graffiti', 64, 32, (ctx, w, h, rnd) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(220,40,60)';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('11:0', 4, 22);
    ctx.fillStyle = 'rgba(60,200,220,0.9)';
    for (let i = 0; i < 40; i++) ctx.fillRect((rnd() * w) | 0, 26 + ((rnd() * 4) | 0), 2, 1);
  });

// ── Darts board ──────────────────────────────────────────────

export const DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** Ring radii as fraction of the playable radius (170 mm standard). */
export const DART_RINGS = { bull: 6.35 / 170, outerBull: 15.9 / 170, tripleIn: 99 / 170, tripleOut: 107 / 170, doubleIn: 162 / 170, doubleOut: 1 };

export const dartboard = () =>
  make(
    'dartboard',
    256,
    256,
    (ctx, w) => {
      const c = w / 2;
      const R = w * 0.4; // playable radius inside the number ring
      ctx.fillStyle = rgb(18, 16, 16);
      ctx.fillRect(0, 0, w, w);
      ctx.beginPath();
      ctx.arc(c, c, w / 2, 0, Math.PI * 2);
      ctx.fillStyle = rgb(24, 20, 20);
      ctx.fill();
      const seg = (Math.PI * 2) / 20;
      const ring = (r0: number, r1: number, colorFor: (i: number) => string) => {
        for (let i = 0; i < 20; i++) {
          const a0 = -Math.PI / 2 + (i - 0.5) * seg;
          ctx.beginPath();
          ctx.arc(c, c, r1 * R, a0, a0 + seg);
          ctx.arc(c, c, r0 * R, a0 + seg, a0, true);
          ctx.closePath();
          ctx.fillStyle = colorFor(i);
          ctx.fill();
        }
      };
      const dark = rgb(20, 18, 18);
      const light = rgb(222, 206, 170);
      const red = rgb(186, 32, 30);
      const green = rgb(26, 120, 62);
      ring(DART_RINGS.doubleIn, 1, (i) => (i % 2 ? green : red));
      ring(DART_RINGS.tripleOut, DART_RINGS.doubleIn, (i) => (i % 2 ? light : dark));
      ring(DART_RINGS.tripleIn, DART_RINGS.tripleOut, (i) => (i % 2 ? green : red));
      ring(DART_RINGS.outerBull, DART_RINGS.tripleIn, (i) => (i % 2 ? light : dark));
      ctx.beginPath();
      ctx.arc(c, c, DART_RINGS.outerBull * R, 0, Math.PI * 2);
      ctx.fillStyle = green;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c, DART_RINGS.bull * R * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = red;
      ctx.fill();
      // wires
      ctx.strokeStyle = rgb(160, 160, 160);
      ctx.lineWidth = 1;
      for (const r of [DART_RINGS.outerBull, DART_RINGS.tripleIn, DART_RINGS.tripleOut, DART_RINGS.doubleIn, 1]) {
        ctx.beginPath();
        ctx.arc(c, c, r * R, 0, Math.PI * 2);
        ctx.stroke();
      }
      // numbers
      ctx.fillStyle = rgb(235, 230, 215);
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      DART_ORDER.forEach((n, i) => {
        const a = -Math.PI / 2 + i * seg;
        ctx.fillText(String(n), c + Math.cos(a) * R * 1.13, c + Math.sin(a) * R * 1.13);
      });
    },
    false,
  );

// ── Cards ────────────────────────────────────────────────────

const SUIT_COLOR: Record<string, string> = { '♠': rgb(20, 20, 30), '♣': rgb(20, 20, 30), '♥': rgb(180, 20, 30), '♦': rgb(180, 20, 30) };

export const cardFace = (rank: string, suit: string) =>
  make(
    `card-${rank}${suit}`,
    48,
    72,
    (ctx, w, h, rnd) => {
      ctx.fillStyle = rgb(20, 14, 10);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgb(232, 222, 196);
      ctx.fillRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = SUIT_COLOR[suit];
      ctx.font = 'bold 12px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(rank, 3, 2);
      ctx.fillText(suit, 3, 13);
      ctx.save();
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      ctx.fillText(rank, 3, 2);
      ctx.fillText(suit, 3, 13);
      ctx.restore();
      ctx.font = 'bold 28px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(suit, w / 2, h / 2 + 2);
      grain(ctx, w, h, rnd, 0.06);
    },
    false,
  );

export const cardBack = () =>
  make(
    'cardBack',
    48,
    72,
    (ctx, w, h) => {
      ctx.fillStyle = rgb(20, 14, 10);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgb(110, 16, 26);
      ctx.fillRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = rgb(190, 150, 60);
      for (let y = 4; y < h - 4; y += 6)
        for (let x = 4 + ((y / 6) % 2) * 3; x < w - 4; x += 6) ctx.fillRect(x, y, 2, 2);
      ctx.strokeStyle = rgb(190, 150, 60);
      ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
    },
    false,
  );

// ── Dice ─────────────────────────────────────────────────────

export const dieFace = (n: number) =>
  make(
    `die-${n}`,
    16,
    16,
    (ctx, w, h) => {
      ctx.fillStyle = rgb(220, 210, 190);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = n === 1 ? rgb(180, 20, 30) : rgb(20, 16, 20);
      const pip = (x: number, y: number) => ctx.fillRect(x - 1, y - 1, 3, 3);
      const P: Record<number, [number, number][]> = {
        1: [[8, 8]],
        2: [[4, 4], [12, 12]],
        3: [[4, 4], [8, 8], [12, 12]],
        4: [[4, 4], [12, 4], [4, 12], [12, 12]],
        5: [[4, 4], [12, 4], [8, 8], [4, 12], [12, 12]],
        6: [[4, 4], [12, 4], [4, 8], [12, 8], [4, 12], [12, 12]],
      };
      P[n].forEach(([x, y]) => pip(x, y));
    },
    false,
  );

// ── Wheel of Fortune (redrawn per spin) ──────────────────────

export interface WheelSector {
  weight: number;
  color: string;
  label: string;
}

export function drawWheel(canvas: HTMLCanvasElement, sectors: WheelSector[]) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const c = w / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.fillStyle = rgb(30, 20, 14);
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  const total = sectors.reduce((s, x) => s + x.weight, 0);
  let a = -Math.PI / 2;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const sec of sectors) {
    const span = (sec.weight / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c - 8, a, a + span);
    ctx.closePath();
    ctx.fillStyle = sec.color;
    ctx.fill();
    ctx.strokeStyle = rgb(200, 160, 70);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (span > 0.16) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a + span / 2);
      ctx.fillStyle = rgb(250, 240, 220);
      ctx.fillText(sec.label, c - 16, 0);
      ctx.restore();
    }
    a += span;
  }
  // rim studs
  ctx.fillStyle = rgb(220, 180, 80);
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    ctx.fillRect((c + Math.cos(t) * (c - 4) - 2) | 0, (c + Math.sin(t) * (c - 4) - 2) | 0, 4, 4);
  }
  ctx.beginPath();
  ctx.arc(c, c, 22, 0, Math.PI * 2);
  ctx.fillStyle = rgb(40, 26, 16);
  ctx.fill();
  ctx.strokeStyle = rgb(220, 180, 80);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = rgb(200, 30, 40);
  ctx.fillRect(c - 4, c - 4, 8, 8);
}
