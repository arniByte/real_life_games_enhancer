import { type ButtonHTMLAttributes, type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { IconId } from '../../core/types';
import { ICONS } from '../icons';
import { sfx } from '../../audio/sfx';
import { Heading } from '../pixel/Type';

export function PixelIcon({ id, color = 'currentColor', size = 20, title }: { id: IconId; color?: string; size?: number; title?: string }) {
  const rects = useMemo(() => {
    const rows = ICONS[id] ?? ICONS.skull;
    const out: { x: number; y: number; c: string }[] = [];
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '#') out.push({ x, y, c: 'main' });
        else if (ch === '+') out.push({ x, y, c: 'hi' });
        else if (ch === '-') out.push({ x, y, c: 'lo' });
      }),
    );
    return out;
  }, [id]);
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" style={{ display: 'block', flex: 'none' }} aria-label={title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={1}
          height={1}
          fill={r.c === 'main' ? color : r.c === 'hi' ? '#fff8e0' : '#000'}
          opacity={r.c === 'lo' ? 0.55 : 1}
        />
      ))}
    </svg>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'gold' | 'soul' | 'ghost';
  size?: 'small' | 'big';
  block?: boolean;
  selected?: boolean;
  icon?: boolean;
  silent?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Btn({ variant, size, block, selected, icon, silent, className = '', onClick, onMouseEnter, ...rest }: BtnProps) {
  const cls = ['btn', variant, size, block && 'block', selected && 'selected', icon && 'icon', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={cls}
      onMouseEnter={(e) => {
        if (!rest.disabled) sfx.hover();
        onMouseEnter?.(e);
      }}
      onClick={(e) => {
        if (!silent) sfx.click();
        onClick?.(e);
      }}
      {...rest}
    />
  );
}

export function Souls({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="souls" style={{ fontSize: size }}>
      <SoulGlyph size={size} />
      {n}
    </span>
  );
}

export function SoulGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ display: 'block', filter: 'drop-shadow(0 0 3px rgba(143,240,255,.7))' }}>
      <rect x="3" y="0" width="1" height="1" fill="#8ff0ff" />
      <rect x="2" y="1" width="3" height="1" fill="#8ff0ff" />
      <rect x="1" y="2" width="5" height="1" fill="#8ff0ff" />
      <rect x="1" y="3" width="6" height="2" fill="#8ff0ff" />
      <rect x="2" y="3" width="2" height="2" fill="#e8ffff" />
      <rect x="1" y="5" width="6" height="1" fill="#46b8cc" />
      <rect x="2" y="6" width="4" height="1" fill="#2a7f90" />
    </svg>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal: transformed / masked ancestors would otherwise trap a fixed overlay.
  return createPortal(
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onClick={onClose}>
      <motion.div
        className="panel solid modal dither-in"
        style={wide ? { width: 'min(1000px, 100%)' } : undefined}
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <Heading>{title}</Heading>
          <Btn variant="ghost" icon onClick={() => { sfx.back(); onClose(); }} aria-label="Закрыть" silent>
            ✕
          </Btn>
        </div>
        <div className="modal-body scroll" style={{ flex: 1 }}>
          {children}
        </div>
        {footer && <div style={{ padding: 'calc(var(--pxn) * 3px)', borderTop: 'var(--px) solid #000', boxShadow: '0 calc(var(--px) * -1) 0 var(--line)' }}>{footer}</div>}
      </motion.div>
    </motion.div>,
    document.getElementById('portal') ?? document.body,
  );
}

export function Seg<T extends string | number | boolean>({
  value,
  choices,
  onChange,
}: {
  value: T;
  choices: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {choices.map((c) => (
        <Btn key={String(c.value)} selected={c.value === value} onClick={() => onChange(c.value)}>
          {c.label}
        </Btn>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="faint" style={{ fontSize: 15 }}>{hint}</div>}
    </div>
  );
}

export { AnimatePresence, motion };

const NARROW = '(max-width: 760px)';

/** Phone-sized screen: secondary controls fold into popovers. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * Secondary actions. On a wide screen they sit inline; on a phone they fold behind
 * a «⋯» button and pop up above it. Any tap inside the popup closes it.
 */
export function More({ label = 'Ещё ▴', title = 'Ещё', children, always }: { label?: ReactNode; title?: string; children: ReactNode; always?: boolean }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left?: number; right?: number; bottom: number }>({ right: 8, bottom: 8 });

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    // Open toward the middle of the screen so the menu never runs off an edge.
    if (r) {
      const bottom = window.innerHeight - r.top + 6;
      setPos(r.left + r.width / 2 < window.innerWidth / 2 ? { left: Math.max(8, r.left), bottom } : { right: Math.max(8, window.innerWidth - r.right), bottom });
    }
    const off = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', off);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!narrow && !always) return <>{children}</>;
  const portal = document.getElementById('portal');
  return (
    <>
      <Btn ref={btn} size="small" variant="ghost" selected={open} onClick={() => setOpen((o) => !o)} aria-expanded={open} title={title}>
        {label}
      </Btn>
      {open &&
        portal &&
        createPortal(
          <div ref={pop} className="more-pop panel solid dither-in" style={pos} onClick={() => setOpen(false)} role="menu">
            {children}
          </div>,
          portal,
        )}
    </>
  );
}
