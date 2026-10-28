import type { Session } from '../../core/types';
import { act, useApp } from '../../core/store';
import { player } from '../../core/session';
import { Btn, PixelIcon, motion } from '../../ui/components/kit';
import { useNav } from '../../ui/nav';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';
import { drawRound, durak, playerOut, unmarkOut } from './logic';

export function DurakBoard({ session }: { session: Session }) {
  const g = durak(session);
  const announce = useNav((s) => s.announce);
  if (session.status !== 'playing') return null;

  const out = (pid: string) => {
    const roundBefore = durak(useApp.getState().session!).round;
    act((s) => playerOut(s, pid));
    const after = useApp.getState().session!;
    const ga = durak(after);
    if (ga.round !== roundBefore || after.status === 'finished') {
      const last = ga.history[ga.history.length - 1];
      if (last?.foolId) {
        const fool = player(after, last.foolId);
        fx({ type: 'durak.fool' });
        fx({ type: 'flash', color: '#c0262d', strength: 0.4 });
        fx({ type: 'shake', amount: 0.15 });
        sfx.fool();
        announce(last.foolWeight === 0 ? 'МАСКА!' : 'ДУРАК', last.foolWeight === 0 ? '#b06aff' : '#e2433c', fool.name);
      }
    } else {
      fx({ type: 'durak.out' });
      sfx.confirm();
    }
  };

  const remaining = g.order.filter((id) => !g.out.includes(id));
  const recent = g.history.slice(-5).reverse();

  return (
    <div className="durak">
      <div className="field-label">Раунд {g.round} · жми игрока, когда он избавился от карт</div>
      <div className="durak-grid">
        {g.order.map((id) => {
          const p = player(session, id);
          const pos = g.out.indexOf(id);
          return (
            <motion.button
              key={id}
              type="button"
              layout
              className={`durak-btn ${pos >= 0 ? 'out' : ''}`}
              style={{ ['--pc' as string]: p.color }}
              onClick={() => (pos >= 0 ? act((s) => unmarkOut(s, id)) : out(id))}
              whileTap={{ scale: 0.95 }}
            >
              <PixelIcon id={p.sigil} color={p.color} size={22} />
              <span className="durak-name">{p.name}</span>
              <span className="durak-state">{pos >= 0 ? `вышел ${pos + 1}-м ✓` : 'в игре'}</span>
              <span className="durak-fools">
                {Array.from({ length: g.foolLimit }, (_, i) => (
                  <i key={i} className={i < g.fools[id] ? 'on' : ''} />
                ))}
              </span>
            </motion.button>
          );
        })}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <Btn size="small" onClick={() => { act((s) => drawRound(s)); sfx.confirm(); }} disabled={remaining.length !== 2}>
          Ничья (двое вышли разом)
        </Btn>
        <div className="grow" />
        {recent.length > 0 && (
          <div className="faint durak-history">
            {recent.map((r) => (
              <span key={r.no}>
                R{r.no}: {r.foolId ? player(session, r.foolId).name : 'ничья'}
                {r.foolWeight === 2 ? ' ×2' : r.foolWeight === 0 && r.foolId ? ' (маска)' : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
