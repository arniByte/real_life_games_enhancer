// Text rasterized like a PS1 title card: drawn tiny, alpha-thresholded to hard pixels,
// filled with an ordered-dithered gradient, outlined, shadowed, chroma-fringed and upscaled.

import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { currentPx } from './theme';

/** The UI pixel size, re-rendering when the viewport changes it. */
export function usePx(): number {
  const [px, setPx] = useState(currentPx);
  useEffect(() => {
    const on = () => setPx(currentPx());
    window.addEventListener('pxchange', on);
    return () => window.removeEventListener('pxchange', on);
  }, []);
  return px;
}

export type Tone = 'gold' | 'bone' | 'blood' | 'soul' | 'violet' | 'green' | 'ash';
type RGB = [number, number, number];

const TONES: Record<Tone, [RGB, RGB]> = {
  gold: [[255, 232, 150], [156, 84, 18]],
  bone: [[252, 246, 228], [150, 128, 104]],
  blood: [[255, 128, 100], [122, 10, 22]],
  soul: [[214, 255, 255], [40, 140, 172]],
  violet: [[236, 206, 255], [98, 48, 168]],
  green: [[210, 255, 170], [60, 120, 40]],
  ash: [[200, 190, 176], [90, 82, 74]],
};

export const FONTS = {
  gothic: { family: 'Cormorant SC', weight: 700, cut: 100 },
  slavic: { family: 'Ruslan Display', weight: 400, cut: 110 },
  pixel: { family: 'Tiny5', weight: 400, cut: 120 },
} as const;
export type FontKey = keyof typeof FONTS;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const loaded = new Map<string, Promise<unknown>>();
function ensureFont(font: string): Promise<unknown> {
  let p = loaded.get(font);
  if (!p) {
    p = document.fonts?.load(font, 'АБВabc123') ?? Promise.resolve();
    loaded.set(font, p);
  }
  return p;
}

function hexToRgb(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toneFor(tone: Tone | string): [RGB, RGB] {
  if (tone in TONES) return TONES[tone as Tone];
  const c = hexToRgb(tone);
  const hi: RGB = [Math.min(255, c[0] * 0.55 + 125), Math.min(255, c[1] * 0.55 + 125), Math.min(255, c[2] * 0.55 + 125)];
  const lo: RGB = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];
  return [hi, lo];
}

interface RenderOpts {
  lines: string[];
  font: FontKey;
  size: number;
  tone: Tone | string;
  align: 'left' | 'center' | 'right';
  chroma: boolean;
  lineGap: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function thresholdMask(ctx: CanvasRenderingContext2D, W: number, H: number, cut: number): Uint8Array {
  const src = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = src[i * 4 + 3] > cut ? 1 : 0;
  return mask;
}

/**
 * Pixel fonts: render 4× larger at each of 4×4 sub-pixel phases and keep the phase whose
 * coverage is the most binary — the font's own pixel grid then lands exactly on ours.
 */
function gridMask(o: RenderOpts, _fontCss: string, W: number, H: number, widths: number[], lineH: number, pad: number): Uint8Array {
  const S = 4;
  const f = FONTS[o.font];
  const big = document.createElement('canvas');
  big.width = W * S;
  big.height = H * S;
  const ctx = big.getContext('2d', { willReadFrequently: true })!;
  let best: Uint8Array | null = null;
  let bestScore = -1;
  for (let oy = 0; oy < S; oy++)
    for (let ox = 0; ox < S; ox++) {
      ctx.clearRect(0, 0, big.width, big.height);
      ctx.font = `${f.weight} ${o.size * S}px "${f.family}"`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      o.lines.forEach((l, i) => {
        const x = o.align === 'center' ? (W - widths[i]) / 2 : o.align === 'right' ? W - pad - widths[i] : pad;
        ctx.fillText(l, Math.round(x) * S + ox, (pad + Math.round(o.size * 0.9) + i * lineH) * S + oy);
      });
      const d = ctx.getImageData(0, 0, big.width, big.height).data;
      const mask = new Uint8Array(W * H);
      let score = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let sum = 0;
          for (let j = 0; j < S; j++) for (let k = 0; k < S; k++) sum += d[((y * S + j) * big.width + x * S + k) * 4 + 3];
          const a = sum / (S * S * 255);
          mask[y * W + x] = a > 0.5 ? 1 : 0;
          score += Math.abs(a - 0.5);
        }
      if (score > bestScore) {
        bestScore = score;
        best = mask;
      }
    }
  return best!;
}

function render(canvas: HTMLCanvasElement, o: RenderOpts) {
  const f = FONTS[o.font];
  const fontCss = `${f.weight} ${o.size}px "${f.family}"`;
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d')!;
  tctx.font = fontCss;
  const pad = 3;
  const lineH = Math.ceil(o.size * (o.font === 'pixel' ? 1.05 : 1.12)) + o.lineGap;
  const widths = o.lines.map((l) => Math.ceil(tctx.measureText(l).width));
  const W = Math.max(1, ...widths) + pad * 2;
  const H = lineH * o.lines.length + pad * 2 + 2;
  tmp.width = W;
  tmp.height = H;
  tctx.font = fontCss;
  tctx.textBaseline = 'alphabetic';
  tctx.fillStyle = '#fff';
  o.lines.forEach((l, i) => {
    const x = o.align === 'center' ? (W - widths[i]) / 2 : o.align === 'right' ? W - pad - widths[i] : pad;
    tctx.fillText(l, Math.round(x), pad + Math.round(o.size * (o.font === 'pixel' ? 0.9 : 0.98)) + i * lineH);
  });
  const mask = o.font === 'pixel' ? gridMask(o, fontCss, W, H, widths, lineH, pad) : thresholdMask(tctx, W, H, f.cut);

  const [top, bot] = toneFor(o.tone);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  const put = (i: number, r: number, g: number, b: number, a: number) => {
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = a;
  };

  for (let y = 0; y < H; y++) {
    // gradient per text line so every line gets the full ramp
    const lineIdx = Math.min(o.lines.length - 1, Math.max(0, Math.floor((y - pad) / lineH)));
    const ly = (y - pad - lineIdx * lineH) / (o.size * 1.05);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) {
        const t = Math.min(1, Math.max(0, ly));
        const th = (BAYER[y % 4][x % 4] + 0.5) / 16;
        // three-step ramp: highlight band on top, mid, shadow at the bottom
        const c: RGB = t < 0.18 && th > 0.4 ? [Math.min(255, top[0] + 30), Math.min(255, top[1] + 30), Math.min(255, top[2] + 30)] : t > th ? bot : top;
        put(i, c[0], c[1], c[2], 255);
        continue;
      }
      // Outline: left/right edges bleed red/cyan like a worn tape (chroma), top/bottom stay black.
      const glyphLeft = at(x - 1, y);
      const glyphRight = at(x + 1, y);
      const vertical = at(x, y - 1) || at(x, y + 1);
      const shadow = at(x - 1, y - 1) || at(x - 2, y - 2) || at(x - 1, y - 2);
      if (o.chroma && glyphLeft && !glyphRight && !vertical) put(i, 150, 18, 52, 255);
      else if (o.chroma && glyphRight && !glyphLeft && !vertical) put(i, 18, 104, 150, 255);
      else if (glyphLeft || glyphRight || vertical) put(i, 8, 4, 10, 255);
      else if (shadow) put(i, 0, 0, 0, 170);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface PixelTextProps {
  text: string | number;
  /** Font size in art pixels. */
  size?: number;
  font?: FontKey;
  tone?: Tone | string;
  /** Upscale factor; defaults to the UI pixel size. */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** Wrap to the parent width. */
  wrap?: boolean;
  chroma?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'span' | 'h1' | 'h2' | 'h3';
  title?: string;
}

export function PixelText({
  text,
  size = 16,
  font = 'gothic',
  tone = 'bone',
  scale,
  align = 'left',
  wrap: doWrap,
  chroma = true,
  className,
  style,
  as: Tag = 'div',
  title,
}: PixelTextProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(0);
  const [width, setWidth] = useState(0);
  const str = String(text);
  const px = usePx();
  const k = scale ?? px;
  const f = FONTS[font];
  const fontCss = `${f.weight} ${size}px "${f.family}"`;

  useEffect(() => {
    let alive = true;
    ensureFont(fontCss).then(() => alive && setReady((r) => r + 1));
    return () => {
      alive = false;
    };
  }, [fontCss]);

  useLayoutEffect(() => {
    if (!doWrap || !box.current?.parentElement) return;
    const el = box.current.parentElement;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doWrap]);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const m = document.createElement('canvas').getContext('2d')!;
    m.font = fontCss;
    const lines = doWrap && width > 0 ? wrap(m, str, width / k - 8) : str.split('\n');
    render(c, { lines, font, size, tone, align, chroma, lineGap: font === 'pixel' ? 2 : 1 });
    c.style.width = `${c.width * k}px`;
    c.style.height = `${c.height * k}px`;
  }, [str, size, font, tone, k, align, chroma, doWrap, width, ready, fontCss]);

  return (
    <Tag
      ref={box as never}
      className={`pixel-text ${className ?? ''}`}
      style={{ textAlign: align, ...style }}
      aria-label={title ?? str}
      role={Tag === 'div' || Tag === 'span' ? 'text' : undefined}
    >
      <canvas ref={ref} aria-hidden="true" />
    </Tag>
  );
}
