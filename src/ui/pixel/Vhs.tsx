// VHS/CRT layer over the whole app: animated tape noise, a rolling tracking band,
// head-switching noise at the bottom, random tape jolts, and the VCR on-screen display.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNav } from '../nav';

export function Vhs({ crt, reduced }: { crt: boolean; reduced: boolean }) {
  const noise = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = noise.current;
    if (!c) return;
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66 || document.hidden) return;
      last = t;
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = Math.random() < 0.35 ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Random tape jolts: the whole picture jumps, colors split, a tear runs across.
  useEffect(() => {
    if (reduced) return;
    let t = 0;
    const root = document.documentElement;
    const schedule = () => {
      t = window.setTimeout(() => {
        root.style.setProperty('--tear-y', `${10 + Math.random() * 80}%`);
        root.classList.add('vhs-glitch');
        window.setTimeout(() => root.classList.remove('vhs-glitch'), 120 + Math.random() * 160);
        schedule();
      }, 6000 + Math.random() * 10000);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [reduced]);

  return (
    <div className={`vhs ${crt ? 'crt-on' : ''}`} aria-hidden="true">
      <canvas ref={noise} className="vhs-noise" />
      {crt && <div className="vhs-scan" />}
      {!reduced && <div className="vhs-track" />}
      <div className="vhs-tear" />
      <div className="vhs-head" />
      {crt && <div className="vhs-vignette" />}
      <Osd />
    </div>
  );
}

/** VCR on-screen display: ▶ PLAY, ◀◀ REW, ● REC… */
function Osd() {
  const osd = useNav((s) => s.osd);
  const screen = useNav((s) => s.screen);
  const [clock, setClock] = useState('0:00:00');
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      setClock(`${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <AnimatePresence>
        {osd && (
          <motion.div key={osd.id} className={`osd osd-${osd.kind}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>
            {osd.text}
          </motion.div>
        )}
      </AnimatePresence>
      {(screen === 'title' || screen === 'hub') && <div className="osd-clock">SP {clock}</div>}
    </>
  );
}
