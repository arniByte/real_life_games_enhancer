import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '../../core/types';
import { act, useApp } from '../../core/store';
import { player } from '../../core/session';
import { Btn, motion } from '../../ui/components/kit';
import { useNav } from '../../ui/nav';
import { fx, onScene } from '../../three';
import { Num } from '../../ui/pixel/Type';
import { sfx } from '../../audio/sfx';
import { addDart, checkoutHint, commitTurn, currentId, darts, dartsAllowed, resolveTurn, turnMods, undoDart } from './logic';
import { type Dart, dartLabel } from './state';

const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

export function DartsBoard({ session }: { session: Session }) {
  const [ring, setRing] = useState<1 | 2 | 3>(1);
  const g = darts(session);
  const pid = currentId(session);
  const p = player(session, pid);
  const allowed = dartsAllowed(p);
  const mods = turnMods(p);
  const preview = resolveTurn(g, g.scores[pid], g.turn, mods);
  const remainingNow = g.mode === 'x01' ? preview.newScore : g.scores[pid] + preview.scored;
  const hint = useMemo(
    () => (g.mode === 'x01' ? checkoutHint(remainingNow, allowed - g.turn.length, g.doubleOut) : null),
    [g.mode, remainingNow, allowed, g.turn.length, g.doubleOut],
  );
  const last = g.history[g.history.length - 1];
  const announce = useNav((s) => s.announce);

  const [aim, setAim] = useState<string | null>(null);
  // Keypad or the 3D board as the input; the choice sticks per device.
  const [pad, setPadState] = useState(() => {
    try {
      return localStorage.getItem('rlge.dartsPad') !== 'board';
    } catch {
      return true;
    }
  });
  const setPad = (v: boolean) => {
    setPadState(v);
    try {
      localStorage.setItem('rlge.dartsPad', v ? 'pad' : 'board');
    } catch {
      /* private mode */
    }
  };

  const throwDart = (d: Dart, at?: { x: number; y: number }) => {
    if (session.status !== 'playing') return;
    const before = darts(useApp.getState().session!).history.length;
    act((s) => addDart(s, d));
    fx({ type: 'darts.hit', n: d.n, m: d.m, at });
    if (d.n === 0) sfx.miss();
    else sfx.dart(d.m);
    setRing(1);
    const after = useApp.getState().session!;
    const h = darts(after).history;
    if (h.length > before) reactToTurn(h[h.length - 1], after);
  };

  const reactToTurn = (t: (typeof g.history)[number], s: Session) => {
    const name = player(s, t.playerId).name;
    if (t.bust) {
      fx({ type: 'darts.bust' });
      fx({ type: 'flash', color: '#c0262d', strength: 0.45 });
      fx({ type: 'shake', amount: 0.12 });
      setTimeout(() => sfx.bust(), 300);
      announce('ПЕРЕБОР', '#e2433c', name);
      return;
    }
    if (t.finished) return;
    if (t.scored >= 180) {
      fx({ type: 'darts.big', score: t.scored });
      fx({ type: 'flash', color: '#ffd070', strength: 0.7 });
      fx({ type: 'shake', amount: 0.25 });
      setTimeout(() => sfx.fanfare(), 350);
      announce(String(t.scored), '#ffc23a', `${name} · ТОН-80!`);
    } else if (t.scored >= 100) {
      fx({ type: 'darts.big', score: t.scored });
      setTimeout(() => sfx.blessing(1), 350);
      announce(String(t.scored), '#f0c040', name);
    }
    fx({ type: 'darts.clear' });
  };

  // The chalkboard on the tavern wall mirrors the score.
  const chalk = () => {
    const s = useApp.getState().session;
    if (!s || s.gameId !== 'darts') return;
    const gg = darts(s);
    const cur = currentId(s);
    const cp = player(s, cur);
    const pv = resolveTurn(gg, gg.scores[cur], gg.turn, turnMods(cp));
    const now = gg.mode === 'x01' ? pv.newScore : gg.scores[cur] + pv.scored;
    const live = s.status === 'playing';
    fx({
      type: 'darts.score',
      title: gg.mode === 'x01' ? `${gg.start}${gg.doubleOut ? ' · дабл' : ''}` : `раунд ${gg.round}/${gg.maxRounds}`,
      rows: gg.order.map((id) => ({
        name: player(s, id).name,
        color: player(s, id).color,
        score: String(id === cur && live ? now : gg.scores[id]),
        active: id === cur && live,
      })),
      turn: Array.from({ length: dartsAllowed(cp) }, (_, i) => (gg.turn[i] ? dartLabel(gg.turn[i]) : '-')),
    });
  };
  useEffect(chalk, [session]);

  // Tapping the 3D board throws a dart exactly there.
  const handlers = useRef({ throwDart, chalk });
  handlers.current = { throwDart, chalk };
  useEffect(
    () =>
      onScene((e) => {
        if (e.type === 'darts.board') handlers.current.throwDart({ n: e.n, m: e.m }, e.at);
        if (e.type === 'darts.aim') setAim(dartLabel({ n: e.n, m: e.m }));
        if (e.type === 'darts.aimOff') setAim(null);
        if (e.type === 'scene.ready' && e.id === 'darts') handlers.current.chalk();
      }),
    [],
  );

  const endTurn = () => {
    const before = darts(useApp.getState().session!).history.length;
    act((s) => commitTurn(s));
    sfx.confirm();
    const after = useApp.getState().session!;
    const h = darts(after).history;
    if (h.length > before) reactToTurn(h[h.length - 1], after);
  };

  const effects: string[] = [];
  if (mods.mult !== 1) effects.push(`очки ×${mods.mult}`);
  if (allowed !== 3) effects.push(`${allowed} дротика`);
  if (mods.shield) effects.push('щит от перебора');
  if (mods.bullUp) effects.push('25 = 50');
  if (mods.firstSingle > 1) effects.push(`1-й сингл ×${mods.firstSingle}`);
  mods.cursed.forEach((n) => effects.push(`сектор ${n} проклят`));
  if (mods.zero) effects.push('очки сгорают');

  if (session.status !== 'playing') return null;

  return (
    <div className="darts">
      <div className="darts-head" style={{ ['--pc' as string]: p.color }}>
        <div className="darts-who">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="dim">{g.mode === 'x01' ? '· осталось' : '· будет'}</span>
          <Num size={18} tone={preview.bust ? 'blood' : 'gold'}>
            {remainingNow}
          </Num>
        </div>
        <div className="darts-slots">
          {Array.from({ length: allowed }, (_, i) => {
            const d = g.turn[i];
            return (
              <motion.div key={i + (d ? dartLabel(d) : '')} className={`dart-slot ${d ? 'on' : ''}`} initial={d ? { scale: 1.4 } : false} animate={{ scale: 1 }}>
                {d ? dartLabel(d) : '—'}
              </motion.div>
            );
          })}
        </div>
      </div>

      {(hint || aim || effects.length > 0 || preview.bust) && (
        <div className="darts-info">
          {aim && <span className="chip-hint">⌖ Прицел: {aim}</span>}
          {hint && <span className="chip-hint">✦ Закрытие: {hint}</span>}
          {effects.map((e) => (
            <span key={e} className="chip-effect">
              ⚙ {e}
            </span>
          ))}
        </div>
      )}

      {!pad && <div className="darts-board-hint">⌖ Тапни по мишени — дротик ляжет точно туда</div>}

      {pad && (
        <>
        <div className="darts-rings">
          {([1, 2, 3] as const).map((m) => (
            <Btn key={m} selected={ring === m} onClick={() => setRing(m)} className={`ring-btn ring-${m}`}>
              {m === 1 ? 'Сингл' : m === 2 ? 'Дабл ×2' : 'Трипл ×3'}
            </Btn>
          ))}
        </div>

        <div className="darts-pad">
          {NUMBERS.map((n) => (
            <Btn key={n} className={`pad-btn ring-${ring}`} onClick={() => throwDart({ n, m: ring })} silent>
              {ring === 3 ? 'T' : ring === 2 ? 'D' : ''}
              {n}
            </Btn>
          ))}
          <Btn className="pad-btn bull" onClick={() => throwDart({ n: 25, m: 1 })} silent>
            25
          </Btn>
          <Btn className="pad-btn bullseye" onClick={() => throwDart({ n: 25, m: 2 })} silent>
            50
          </Btn>
          <Btn className="pad-btn miss" onClick={() => throwDart({ n: 0, m: 1 })} silent>
            Мимо
          </Btn>
        </div>
        </>
      )}

      <div className="darts-foot">
        <Btn variant="ghost" size="small" onClick={() => act((s) => undoDart(s))} disabled={g.turn.length === 0}>
          ⌫ Дротик
        </Btn>
        <Btn variant="ghost" size="small" onClick={() => setPad(!pad)} title="Ввод: цифры или мишень">
          {pad ? '⌖ Мишень' : '# Цифры'}
        </Btn>
        {!pad && (
          <Btn variant="ghost" size="small" onClick={() => throwDart({ n: 0, m: 1 })} silent>
            Мимо
          </Btn>
        )}
        <div className="grow faint darts-last">
          {last && (
            <>
              {player(session, last.playerId).name}: {last.bust ? 'перебор' : `${last.darts.map(dartLabel).join(' ') || '—'} = ${last.scored}`}
            </>
          )}
        </div>
        <Btn variant="gold" size="small" onClick={endTurn}>
          Завершить ход ▶
        </Btn>
      </div>
    </div>
  );
}
