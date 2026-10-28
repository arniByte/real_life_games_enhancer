import { useState } from 'react';
import type { Session } from '../../core/types';
import { act } from '../../core/store';
import { player } from '../../core/session';
import { Btn, PixelIcon } from '../../ui/components/kit';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';
import { addPoints, endRound, endUniversal, nextTurn, uni } from './logic';

export function UniversalBoard({ session }: { session: Session }) {
  const g = uni(session);
  const [custom, setCustom] = useState<Record<string, string>>({});
  if (session.status !== 'playing') return null;
  const current = g.order[g.current];

  const add = (pid: string, delta: number) => {
    if (!delta) return;
    act((s) => addPoints(s, pid, delta));
    fx({ type: 'uni.points', delta });
    if (delta > 0) sfx.point();
    else sfx.back();
  };

  const submitCustom = (pid: string) => {
    const v = parseInt(custom[pid] ?? '', 10);
    if (!Number.isNaN(v)) add(pid, v);
    setCustom({ ...custom, [pid]: '' });
  };

  return (
    <div className="uni">
      <div className="uni-rows scroll">
        {g.order.map((id) => {
          const p = player(session, id);
          return (
            <div key={id} className={`uni-row ${id === current ? 'active' : ''}`} style={{ ['--pc' as string]: p.color }}>
              <PixelIcon id={p.sigil} color={p.color} size={18} />
              <span className="uni-name">{p.name}</span>
              <Btn size="small" onClick={() => add(id, -g.step)} silent>
                −{g.step}
              </Btn>
              <Btn size="small" variant="gold" onClick={() => add(id, g.step)} silent>
                +{g.step}
              </Btn>
              <Btn size="small" className="hide-sm" onClick={() => add(id, g.step * 5)} silent>
                +{g.step * 5}
              </Btn>
              <form
                className="uni-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCustom(id);
                }}
              >
                <input className="input" inputMode="numeric" placeholder="±" value={custom[id] ?? ''} onChange={(e) => setCustom({ ...custom, [id]: e.target.value.replace(/[^-\d]/g, '') })} />
              </form>
            </div>
          );
        })}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <Btn size="small" variant="ghost" onClick={() => { if (confirm('Завершить игру и подвести итоги?')) act((s) => endUniversal(s)); }}>
          Итоги
        </Btn>
        <Btn size="small" variant="ghost" onClick={() => { act((s) => endRound(s)); fx({ type: 'uni.round' }); sfx.confirm(); }}>
          Конец раунда
        </Btn>
        <div className="grow" />
        <Btn
          variant="gold"
          onClick={() => {
            const wrap = g.current === g.order.length - 1;
            act((s) => nextTurn(s));
            if (wrap) fx({ type: 'uni.round' });
            sfx.confirm();
          }}
        >
          Следующий ход ▶
        </Btn>
      </div>
    </div>
  );
}
