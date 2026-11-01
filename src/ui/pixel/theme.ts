// Pixel-art UI skin generated at runtime: 9-slice window frames, dithered fills and
// dissolve masks — drawn on canvas at an integer pixel scale and exposed as CSS vars.

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pixel painter on a small grid, later upscaled with nearest neighbour. */
class Grid {
  readonly data: (RGBA | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: RGBA | RGB | null) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c ? (c.length === 3 ? [c[0], c[1], c[2], 255] : c) : null;
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA | RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  toURL(scale: number): string {
    const c = document.createElement('canvas');
    c.width = this.w * scale;
    c.height = this.h * scale;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const p = this.data[y * this.w + x];
        if (!p) continue;
        ctx.fillStyle = `rgba(${p[0] | 0},${p[1] | 0},${p[2] | 0},${p[3] / 255})`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    return c.toDataURL('image/png');
  }
}

interface FrameStyle {
  /** Outer → inner rings. */
  rings: { hi: RGB | RGBA; lo?: RGB | RGBA }[];
  /** Two face colors dithered together (with alpha). */
  face: [RGBA, RGBA];
  /** Corner ornament color. */
  rivet?: RGB;
  /** Face vertical gradient: top color → bottom color mix factor (uses Bayer). */
  gradient?: boolean;
}

/**
 * 9-slice frame. Layout: ring pixels, then a tile of face. Center tile is 8×8 so dithering repeats cleanly.
 */
function frame(style: FrameStyle): { grid: Grid; slice: number } {
  const ringN = style.rings.length;
  const slice = Math.max(ringN + 1, style.rivet ? 6 : ringN + 1);
  const tile = 8;
  const size = slice * 2 + tile;
  const g = new Grid(size, size);
  // face (whole area, rings draw over it)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const t = style.gradient ? (BAYER4[y % 4][x % 4] + 0.5) / 16 : 0.5;
      const on = style.gradient ? y / size > t * 0.9 + 0.05 : (x + y) % 2 === 0;
      g.set(x, y, on ? style.face[1] : style.face[0]);
    }
  style.rings.forEach((ring, i) => {
    const lo = ring.lo ?? ring.hi;
    for (let k = i; k < size - i; k++) {
      g.set(k, i, ring.hi); // top
      g.set(i, k, ring.hi); // left
      g.set(k, size - 1 - i, lo); // bottom
      g.set(size - 1 - i, k, lo); // right
    }
    // bevel corner where hi meets lo
    g.set(size - 1 - i, i, lo);
    g.set(i, size - 1 - i, lo);
  });
  if (style.rivet) {
    const r = style.rivet;
    const dark = mix(r, [0, 0, 0], 0.55);
    const corners: [number, number][] = [
      [1, 1],
      [size - 5, 1],
      [1, size - 5],
      [size - 5, size - 5],
    ];
    for (const [cx, cy] of corners) {
      g.rect(cx, cy, 4, 4, [0, 0, 0]);
      g.rect(cx + 1, cy + 1, 2, 2, r);
      g.set(cx + 2, cy + 2, dark);
      g.set(cx + 1, cy + 1, mix(r, [255, 255, 255], 0.5));
    }
  }
  return { grid: g, slice };
}

const PALETTE = {
  black: [0, 0, 0] as RGB,
  // Steel greys for frames, a red rivet as the only accent.
  bronzeHi: hex('#8c8c88'),
  bronze: hex('#3c3c3a'),
  bronzeLo: hex('#141414'),
  gold: hex('#d8261e'),
  goldLo: hex('#4a0a0e'),
};

export interface PixelTheme {
  px: number;
  vars: Record<string, string>;
}

function buttonFrame(face: RGB, hi: RGB, lo: RGB, pressed = false, alpha = 255): FrameStyle {
  const f1: RGBA = [...face, alpha];
  const f2: RGBA = [...mix(face, [0, 0, 0], 0.28), alpha];
  return {
    rings: [{ hi: PALETTE.black }, pressed ? { hi: lo, lo: hi } : { hi, lo }],
    face: pressed ? [f2, f2] : [f1, f2],
  };
}

function cardFrame(color: RGB): FrameStyle {
  return {
    rings: [{ hi: PALETTE.black }, { hi: color, lo: mix(color, [0, 0, 0], 0.45) }, { hi: [0, 0, 0] }, { hi: mix(color, [0, 0, 0], 0.6) }],
    face: [
      [12, 12, 13, 245],
      [20, 20, 21, 245],
    ],
    rivet: color,
  };
}

const RARITY: Record<string, string> = {
  common: '#d8cfb8',
  rare: '#4fb3ff',
  epic: '#b06aff',
  legendary: '#ffc23a',
  c1: '#a5c95a',
  c2: '#ec5a43',
  c3: '#ff2a55',
};

/** Build every frame/mask for a pixel scale and return CSS custom properties. */
export function buildTheme(px: number): PixelTheme {
  const vars: Record<string, string> = {};
  const add = (name: string, f: { grid: Grid; slice: number }) => {
    vars[`--f-${name}`] = `url(${f.grid.toURL(px)})`;
    vars[`--s-${name}`] = String(f.slice * px);
  };

  add('panel', frame({
    rings: [{ hi: PALETTE.black }, { hi: PALETTE.bronzeHi, lo: PALETTE.bronzeLo }, { hi: PALETTE.black }, { hi: PALETTE.bronze, lo: [16, 10, 6] }],
    face: [
      [8, 8, 9, 228],
      [16, 16, 17, 228],
    ],
    rivet: PALETTE.gold,
  }));
  add('panel-solid', frame({
    rings: [{ hi: PALETTE.black }, { hi: PALETTE.bronzeHi, lo: PALETTE.bronzeLo }, { hi: PALETTE.black }, { hi: PALETTE.bronze, lo: [16, 10, 6] }],
    face: [
      [8, 8, 9, 255],
      [15, 15, 16, 255],
    ],
    rivet: PALETTE.gold,
  }));
  add('btn', frame(buttonFrame(hex('#262626'), hex('#6a6a66'), hex('#0c0c0c'))));
  add('btn-hover', frame(buttonFrame(hex('#303030'), hex('#ecebe6'), hex('#1a1a1a'))));
  add('btn-down', frame(buttonFrame(hex('#161616'), hex('#6a6a66'), hex('#0c0c0c'), true)));
  // primary: filled red · gold (the strong secondary): black with a red edge · soul: black with a white edge
  add('btn-primary', frame(buttonFrame(hex('#a3121a'), hex('#ff5a4e'), hex('#3a0406'))));
  add('btn-primary-hover', frame(buttonFrame(hex('#c41a22'), hex('#ffb0a8'), hex('#4a060a'))));
  add('btn-gold', frame(buttonFrame(hex('#1c0c0c'), hex('#ff3b30'), hex('#3a0406'))));
  add('btn-gold-hover', frame(buttonFrame(hex('#2c1010'), hex('#ff8a80'), hex('#4a060a'))));
  add('btn-soul', frame(buttonFrame(hex('#141414'), hex('#ecebe6'), hex('#2a2a2a'))));
  add('btn-soul-hover', frame(buttonFrame(hex('#202020'), hex('#ffffff'), hex('#3a3a3a'))));
  add('btn-ghost', frame(buttonFrame(hex('#000000'), hex('#3c3c3a'), hex('#101010'), false, 150)));
  add('btn-selected', frame(buttonFrame(hex('#3a0a0e'), hex('#ff3b30'), hex('#1c0406'))));
  add('input', frame({
    rings: [{ hi: PALETTE.black }, { hi: hex('#0c0c0c'), lo: hex('#6a6a66') }],
    face: [
      [4, 4, 4, 255],
      [9, 9, 9, 255],
    ],
  }));
  for (const [k, c] of Object.entries(RARITY)) add(`card-${k}`, frame(cardFrame(hex(c))));
  for (const [k, c] of Object.entries(RARITY))
    add(
      `chip-${k}`,
      frame({
        rings: [{ hi: PALETTE.black }, { hi: hex(c), lo: mix(hex(c), [0, 0, 0], 0.5) }],
        face: k.startsWith('c')
          ? [
              [30, 8, 12, 255],
              [16, 4, 8, 255],
            ]
          : [
              [10, 10, 11, 255],
              [18, 18, 19, 255],
            ],
      }),
    );

  // Dithered fills
  const dither = (name: string, a: RGBA, b: RGBA, density = 0.5) => {
    const g = new Grid(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.set(x, y, (BAYER4[y][x] + 0.5) / 16 < density ? b : a);
    vars[`--d-${name}`] = `url(${g.toURL(px)})`;
  };
  dither('dark', [5, 5, 6, 200], [15, 15, 16, 200]);
  dither('blood', [40, 4, 6, 230], [96, 10, 14, 230], 0.35);
  dither('shade', [0, 0, 0, 0], [0, 0, 0, 150], 0.5);

  // Dissolve masks (Bayer thresholds)
  for (let k = 0; k <= 8; k++) {
    const g = new Grid(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((BAYER4[y][x] + 0.5) / 16 < k / 8) g.set(x, y, [255, 255, 255]);
    vars[`--dm${k}`] = `url(${g.toURL(px)})`;
  }

  vars['--px'] = `${px}px`;
  vars['--pxn'] = String(px);
  return { px, vars };
}

/** Integer UI pixel size for the current viewport. */
export function uiPixelSize(): number {
  const short = Math.min(window.innerWidth, window.innerHeight);
  return short >= 1000 ? 4 : short >= 640 ? 3 : 2;
}

let applied = 0;

export function applyTheme() {
  const px = uiPixelSize();
  if (px === applied) return;
  applied = px;
  const { vars } = buildTheme(px);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  window.dispatchEvent(new Event('pxchange'));
}

export const currentPx = () => applied || uiPixelSize();
