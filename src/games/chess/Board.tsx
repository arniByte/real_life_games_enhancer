import { useEffect, useState } from 'react';
import type { Session } from '../../core/types';
import { act } from '../../core/store';
import { player } from '../../core/session';
import { AnimatePresence, Btn, Modal, PixelIcon } from '../../ui/components/kit';
import { useNav } from '../../ui/nav';
import { fx } from '../../three';
import { PixelText, usePx } from '../../ui/pixel/PixelText';
import { sfx } from '../../audio/sfx';
import {
  chess,
  clockRate,
  endChess,
  hitClock,
  idOf,
  pauseClock,
  registerCapture,
  registerCastle,
  registerCheck,
  registerPromotion,
  remainingMs,
  startClock,
} from './logic';
import { PIECE_GLYPH, type PieceKind, type Side, otherSide, sideName } from './state';

const fmt = (ms: number) => {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  if (t < 20000) return `${s}.${Math.floor((t % 1000) / 100)}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function ChessBoard({ session }: { session: Session }) {
  const g = chess(session);
  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState(false);
  const announce = useNav((s) => s.announce);
  const px = usePx();
  const running = g.clock.enabled && g.clock.running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);

  // Flag fall.
  useEffect(() => {
    if (!running || g.result) return;
    const left = remainingMs(session, g.toMove, now);
    if (left <= 0) {
      act((s) => endChess(s, otherSide(g.toMove), 'флаг упал — время вышло'));
      sfx.bust();
      announce('ФЛАГ', '#e2433c', `${sideName(g.toMove)} без времени`);
    }
  }, [now, running, g.toMove, g.result, session, announce]);

  if (session.status !== 'playing') return null;

  const tap = (side: Side) => {
    if (side !== g.toMove) {
      sfx.error();
      return;
    }
    if (g.clock.enabled && !g.clock.running) {
      act((s) => startClock(s));
      sfx.clock();
      return;
    }
    act((s) => hitClock(s));
    sfx.clock();
    fx({ type: 'chess.move', side });
  };

  const capture = (k: PieceKind) => {
    act((s) => registerCapture(s, k));
    fx({ type: 'chess.capture', piece: k });
    fx({ type: 'shake', amount: k === 'q' ? 0.2 : 0.06 });
    sfx.dart(k === 'q' ? 3 : 1);
    if (k === 'q') announce('ФЕРЗЬ ПАЛ', '#b06aff');
  };

  const check = () => {
    act((s) => registerCheck(s));
    fx({ type: 'chess.check' });
    fx({ type: 'flash', color: '#c0262d', strength: 0.3 });
    fx({ type: 'shake', amount: 0.15 });
    sfx.check();
    announce('ШАХ', '#e2433c');
  };

  const finishWith = (winner: Side | 'draw', reason: string) => {
    act((s) => endChess(s, winner, reason));
    setEnding(false);
  };

  const mover = player(session, idOf(session, g.toMove));

  return (
    <div className="chess">
      <div className="clocks">
        {(['w', 'b'] as Side[]).map((side) => {
          const p = player(session, idOf(session, side));
          const active = g.toMove === side;
          const ms = remainingMs(session, side, now);
          const rate = clockRate(session, side);
          return (
            <button
              key={side}
              type="button"
              className={`clock ${active ? 'active' : ''} side-${side} ${ms < 20000 && g.clock.enabled ? 'low' : ''}`}
              style={{ ['--pc' as string]: p.color }}
              onClick={() => tap(side)}
            >
              <div className="clock-who">
                <PixelIcon id={p.sigil} color={p.color} size={16} />
                <span style={{ color: p.color }}>{p.name}</span>
                <span className="faint">· {sideName(side)}</span>
              </div>
              <PixelText
                text={g.clock.enabled ? fmt(ms) : active ? 'ХОД' : '···'}
                font="pixel"
                size={8}
                scale={px * 2}
                tone={g.clock.enabled && ms < 20000 && active ? 'blood' : side === 'w' ? 'bone' : 'violet'}
                align="center"
                chroma={false}
              />
              <div className="clock-sub">
                {active
                  ? g.clock.enabled && !g.clock.running
                    ? 'нажми, чтобы запустить часы'
                    : 'сделал ход — жми'
                  : ' '}
                {rate !== 1 && <b style={{ color: rate < 1 ? '#8ff0ff' : '#ff6050' }}> · время ×{rate}</b>}
              </div>
              <div className="clock-captured">{g.captured[side].map((k, i) => <span key={i}>{PIECE_GLYPH[k]}</span>)}</div>
            </button>
          );
        })}
      </div>

      <div className="chess-events">
        <span className="field-label" style={{ color: mover.color }}>
          {mover.name} взял:
        </span>
        {(['p', 'n', 'b', 'r', 'q'] as PieceKind[]).map((k) => (
          <Btn key={k} className="piece-btn" onClick={() => capture(k)} silent>
            {PIECE_GLYPH[k]}
          </Btn>
        ))}
        <Btn size="small" onClick={check} disabled={g.checkGiven} silent>
          Шах!
        </Btn>
        <Btn size="small" onClick={() => { act((s) => registerCastle(s)); sfx.click(); }} disabled={g.pending.includes('рокировка')} silent>
          Рокировка
        </Btn>
        <Btn size="small" onClick={() => { act((s) => registerPromotion(s)); sfx.blessing(1); fx({ type: 'flash', color: '#ffc23a', strength: 0.3 }); }} silent>
          Превращение
        </Btn>
      </div>

      <div className="chess-foot">
        {g.clock.enabled && g.clock.running && (
          <Btn size="small" variant="ghost" onClick={() => act((s) => pauseClock(s))}>
            ⏸ Пауза
          </Btn>
        )}
        <div className="grow faint chess-hint">
          {g.pending.length ? `В этом ходу: ${g.pending.join(', ')}` : 'Отметь события хода, потом жми свои часы'}
        </div>
        <Btn size="small" variant="primary" onClick={() => setEnding(true)}>
          Конец партии
        </Btn>
      </div>

      <AnimatePresence>
        {ending && (
          <Modal title="Чем кончилась партия?" onClose={() => setEnding(false)}>
            <div className="col" style={{ gap: 10 }}>
              {(['w', 'b'] as Side[]).map((side) => {
                const p = player(session, idOf(session, side));
                return (
                  <div key={side} className="row wrap" style={{ gap: 8 }}>
                    <span className="grow label" style={{ color: p.color, minWidth: 140 }}>
                      {p.name} ({sideName(side).toLowerCase()}) побеждает:
                    </span>
                    <Btn size="small" variant="gold" onClick={() => finishWith(side, 'мат')}>
                      Мат
                    </Btn>
                    <Btn size="small" onClick={() => finishWith(side, 'соперник сдался')}>
                      Сдача
                    </Btn>
                    <Btn size="small" onClick={() => finishWith(side, 'флаг')}>
                      Время
                    </Btn>
                  </div>
                );
              })}
              <Btn block onClick={() => finishWith('draw', 'по соглашению или пат')}>
                Ничья / Пат
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

