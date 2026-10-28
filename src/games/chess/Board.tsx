import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '../../core/types';
import { act, useApp } from '../../core/store';
import { player } from '../../core/session';
import { perkDef } from '../../core/perks/registry';
import { AnimatePresence, Btn, Modal, PixelIcon } from '../../ui/components/kit';
import { useNav } from '../../ui/nav';
import { fx, onScene } from '../../three';
import type { ChessAnim } from '../../three/fx';
import { PixelText, usePx } from '../../ui/pixel/PixelText';
import { sfx } from '../../audio/sfx';
import {
  PERK_MOVES,
  armTwin,
  checkSquare,
  chess,
  clockRate,
  endChess,
  hitClock,
  idOf,
  isPromotion,
  legalMoves,
  pauseClock,
  perkMove,
  perkTargets,
  pieceAt,
  playMove,
  registerCapture,
  registerCastle,
  registerCheck,
  registerPromotion,
  remainingMs,
  startClock,
  type MoveOutcome,
} from './logic';
import { PIECE_GLYPH, type PieceKind, type Side, otherSide, sideName } from './state';

const fmt = (ms: number) => {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  if (t < 20000) return `${s}.${Math.floor((t % 1000) / 100)}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const PROMO: { t: string; glyph: string; name: string }[] = [
  { t: 'q', glyph: '♛', name: 'Ферзь' },
  { t: 'r', glyph: '♜', name: 'Ладья' },
  { t: 'b', glyph: '♝', name: 'Слон' },
  { t: 'n', glyph: '♞', name: 'Конь' },
];

/** Ticking clock + flag fall + the 3D table clock, shared by both modes. */
function useChessClock(session: Session) {
  const g = chess(session);
  const [now, setNow] = useState(Date.now());
  const announce = useNav((s) => s.announce);
  const running = g.clock.enabled && g.clock.running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running || g.result) return;
    if (remainingMs(session, g.toMove, now) <= 0) {
      act((s) => endChess(s, otherSide(g.toMove), 'флаг упал — время вышло'));
      sfx.bust();
      announce('ФЛАГ', '#e2433c', `${sideName(g.toMove)} без времени`);
    }
  }, [now, running, g.toMove, g.result, session, announce]);

  const w = g.clock.enabled ? fmt(remainingMs(session, 'w', now)) : '--:--';
  const b = g.clock.enabled ? fmt(remainingMs(session, 'b', now)) : '--:--';
  const low = g.clock.enabled && remainingMs(session, g.toMove, now) < 20000;
  const send = () => fx({ type: 'chess.clock', w, b, toMove: g.toMove, running, low });
  useEffect(send, [w, b, g.toMove, running, low]);
  return { now, resend: send };
}

export function ChessBoard({ session }: { session: Session }) {
  if (session.status !== 'playing') return null;
  return chess(session).mode === 'mirror' ? <MirrorBoard session={session} /> : <RealBoard session={session} />;
}

// ── Mirror mode: the game is played on the Queen's table ─────

type PerkMode = { uid: string; defId: string; kind: (typeof PERK_MOVES)[string] };

function MirrorBoard({ session }: { session: Session }) {
  const g = chess(session);
  const px = usePx();
  const announce = useNav((s) => s.announce);
  const { now, resend } = useChessClock(session);
  const [sel, setSel] = useState<string | null>(null);
  const [perk, setPerk] = useState<PerkMode | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string; uid?: string } | null>(null);
  const [flip, setFlip] = useState(false);
  const [ending, setEnding] = useState(false);
  const sentFen = useRef<string | null>(null);
  const side = g.toMove;
  const mover = player(session, idOf(session, side));

  // Light up what can happen next.
  const hl = useMemo(() => {
    if (perk) {
      if (perk.kind === 'free' || perk.kind === 'swap') {
        if (!sel) return { selected: null, targets: perkTargets(session, perk.uid, null).map((square) => ({ square, capture: false })), perk: true };
        return {
          selected: sel,
          targets: perkTargets(session, perk.uid, sel).map((square) => ({ square, capture: pieceAt(session, square)?.color === otherSide(side) })),
          perk: true,
        };
      }
      return { selected: null, targets: perkTargets(session, perk.uid, null).map((square) => ({ square, capture: perk.kind === 'remove' })), perk: true };
    }
    if (!sel) return { selected: null, targets: [] };
    const seen = new Set<string>();
    const targets = legalMoves(session, sel)
      .filter((m) => !seen.has(m.to) && seen.add(m.to))
      .map((m) => ({ square: m.to, capture: !!m.captured }));
    return { selected: sel, targets };
  }, [session, sel, perk, side]);

  const sync = (anim?: ChessAnim) => {
    const s = useApp.getState().session!;
    const gg = chess(s);
    sentFen.current = gg.fen;
    fx({ type: 'chess.sync', fen: gg.fen, lastMove: gg.lastMove, check: checkSquare(s), anim, mirror: true, flip });
  };

  // Keep the table in step with the store (undo/redo, perks that edit the board…).
  useEffect(() => {
    if (sentFen.current !== g.fen) sync();
    setSel(null);
  }, [g.fen]);

  useEffect(() => fx({ type: 'chess.highlight', hl }), [hl]);
  useEffect(() => fx({ type: 'chess.view', side: flip ? 'b' : 'w' }), [flip]);

  // Drop a perk mode whose perk is gone (spent, undone, cleansed).
  useEffect(() => {
    if (perk && !mover.perks.some((k) => k.uid === perk.uid)) setPerk(null);
  }, [mover.perks, perk]);

  const after = (out: MoveOutcome | null | undefined) => {
    if (!out) {
      sfx.error();
      return;
    }
    setSel(null);
    setPerk(null);
    sync({ from: out.from, to: out.to, captured: out.captured, capturedAt: out.capturedAt, castle: out.castle, promotion: out.promotion, swap: out.swap });
    if (out.captured) {
      sfx.dart(out.captured === 'q' ? 3 : 1);
      fx({ type: 'shake', amount: out.captured === 'q' ? 0.2 : 0.07 });
      if (out.captured === 'q') announce('ФЕРЗЬ ПАЛ', '#b06aff');
    } else if (out.castle) sfx.whoosh();
    else sfx.clock();
    if (out.promotion) {
      sfx.blessing(2);
      fx({ type: 'flash', color: '#ffc23a', strength: 0.3 });
    }
    if (out.check && !out.mate) {
      sfx.check();
      fx({ type: 'flash', color: '#c0262d', strength: 0.3 });
      fx({ type: 'shake', amount: 0.12 });
      announce('ШАХ', '#e2433c');
    }
    if (out.mate) announce('МАТ', '#ffc23a');
  };

  const move = (from: string, to: string, piece = 'q') => after(act((s) => playMove(s, from, to, piece)));
  const usePerk = (uid: string, from: string, to: string, piece = 'q') => after(act((s) => perkMove(s, uid, from, to, Date.now(), piece)));

  const onSquare = (picked: string, under?: string) => {
    if (promo || ending) return;
    // A tall piece can hide the square behind it: if the piece isn't a target but the floor under the ray is, take the floor.
    const isTarget = (q?: string) => !!q && hl.targets.some((t) => t.square === q);
    const sq = !isTarget(picked) && isTarget(under) ? under! : picked;
    const here = pieceAt(session, sq);
    if (perk) {
      const sources = perkTargets(session, perk.uid, null);
      if (perk.kind === 'rise' || perk.kind === 'remove') {
        if (sources.includes(sq)) usePerk(perk.uid, sq, sq);
        else sfx.error();
        return;
      }
      if (perk.kind === 'promote') {
        if (sources.includes(sq)) setPromo({ from: sq, to: sq, uid: perk.uid });
        else sfx.error();
        return;
      }
      if (sel && hl.targets.some((t) => t.square === sq)) return usePerk(perk.uid, sel, sq);
      if (sources.includes(sq)) {
        setSel(sq === sel ? null : sq);
        sfx.hover();
      } else sfx.error();
      return;
    }
    if (sel && hl.targets.some((t) => t.square === sq)) {
      if (isPromotion(session, sel, sq)) setPromo({ from: sel, to: sq });
      else move(sel, sq);
      return;
    }
    if (here && here.color === side && sq !== sel) {
      if (legalMoves(session, sq).length) {
        setSel(sq);
        sfx.hover();
      } else {
        setSel(null);
        sfx.error();
      }
      return;
    }
    setSel(null);
  };

  // The 3D table talks back.
  const onSquareRef = useRef(onSquare);
  onSquareRef.current = onSquare;
  const resendRef = useRef(() => {});
  resendRef.current = () => {
    sync();
    fx({ type: 'chess.highlight', hl });
    resend();
  };
  useEffect(
    () =>
      onScene((e) => {
        if (e.type === 'chess.square') onSquareRef.current(e.square, e.under);
        if (e.type === 'scene.ready' && e.id === 'chess') resendRef.current();
      }),
    [],
  );

  const perkMoves = mover.perks.filter((k) => PERK_MOVES[k.defId] || k.defId === 'c_twin');
  const togglePerk = (uid: string, defId: string) => {
    if (defId === 'c_twin') {
      act((s) => armTwin(s, uid));
      sfx.blessing(4);
      fx({ type: 'flash', color: '#ffc23a', strength: 0.35 });
      announce('ДВОЙНОЙ ХОД', '#ffc23a');
      return;
    }
    setSel(null);
    setPerk(perk?.uid === uid ? null : { uid, defId, kind: PERK_MOVES[defId] });
    sfx.confirm();
  };

  const hint = perk
    ? perk.kind === 'rise'
      ? 'Выбери клетку для воскрешённой пешки'
      : perk.kind === 'remove'
        ? 'Соперник выбирает твою пешку на снятие'
        : perk.kind === 'promote'
          ? 'Выбери пешку для коронации'
          : sel
            ? 'Куда?'
            : 'Выбери фигуру для перка'
    : sel
      ? `${PIECE_GLYPH[(pieceAt(session, sel)?.type ?? 'p') as PieceKind] ?? '♚'} ${sel} → куда?`
      : g.extraMove
        ? 'Двойной ход: ходи ещё раз'
        : g.clock.enabled && !g.clock.running
          ? 'Первый ход запустит часы'
          : 'Тапни фигуру на столе';

  const pairs: string[] = [];
  for (let i = 0; i < g.moves.length; i += 1) {
    const m = g.moves[i];
    pairs.push(m.side === 'w' ? `${Math.floor(i / 2) + 1}.${m.san}` : m.san);
  }

  return (
    <div className="chess mirror">
      <div className="mclocks">
        {(['w', 'b'] as Side[]).map((sd) => {
          const p = player(session, idOf(session, sd));
          const active = side === sd;
          const ms = remainingMs(session, sd, now);
          const rate = clockRate(session, sd);
          return (
            <div key={sd} className={`mclock ${active ? 'active' : ''} side-${sd} ${ms < 20000 && g.clock.enabled ? 'low' : ''}`} style={{ ['--pc' as string]: p.color }}>
              <div className="clock-who">
                <PixelIcon id={p.sigil} color={p.color} size={16} />
                <span style={{ color: p.color }}>{p.name}</span>
                <span className="faint">{sd === 'w' ? '○' : '●'}</span>
              </div>
              <PixelText
                text={g.clock.enabled ? fmt(ms) : active ? 'ХОД' : '···'}
                font="pixel"
                size={8}
                scale={px * 2}
                tone={g.clock.enabled && ms < 20000 && active ? 'blood' : sd === 'w' ? 'bone' : 'violet'}
                align="center"
                chroma={false}
              />
              <div className="clock-captured">
                {g.captured[sd].map((k, i) => (
                  <span key={i}>{PIECE_GLYPH[k]}</span>
                ))}
                {rate !== 1 && <b style={{ color: rate < 1 ? '#8ff0ff' : '#ff6050' }}> ×{rate}</b>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mhint" style={{ color: perk ? '#d08cff' : mover.color }}>
        <span className="grow">{hint}</span>
        {(sel || perk) && (
          <Btn size="small" variant="ghost" onClick={() => { setSel(null); setPerk(null); }}>
            Отмена
          </Btn>
        )}
      </div>

      {perkMoves.length > 0 && (
        <div className="mperks">
          {perkMoves.map((k) => {
            const def = perkDef(k.defId);
            return (
              <Btn
                key={k.uid}
                size="small"
                variant={def.kind === 'curse' ? undefined : 'gold'}
                selected={perk?.uid === k.uid}
                disabled={k.defId === 'c_twin' && g.extraMove}
                onClick={() => togglePerk(k.uid, k.defId)}
                silent
              >
                <PixelIcon id={def.icon} color={def.kind === 'curse' ? '#e2433c' : '#ffc23a'} size={16} />
                {def.name}
              </Btn>
            );
          })}
        </div>
      )}

      <div className="mmoves">{pairs.length ? pairs.slice(-10).join(' ') : 'Партия начинается. Белые ходят первыми.'}</div>

      <div className="chess-foot">
        {g.clock.enabled && g.clock.running && (
          <Btn size="small" variant="ghost" onClick={() => act((s) => pauseClock(s))}>
            ⏸ Пауза
          </Btn>
        )}
        {g.clock.enabled && !g.clock.running && g.moves.length > 0 && (
          <Btn size="small" variant="ghost" onClick={() => { act((s) => startClock(s)); sfx.clock(); }}>
            ▶ Часы
          </Btn>
        )}
        <Btn size="small" variant="ghost" onClick={() => setFlip((f) => !f)} title="Развернуть доску">
          ⟲ Доска
        </Btn>
        <div className="grow" />
        <Btn size="small" variant="primary" onClick={() => setEnding(true)}>
          Сдача / ничья
        </Btn>
      </div>

      <AnimatePresence>
        {promo && (
          <Modal title="Во что превратить пешку?" onClose={() => setPromo(null)}>
            <div className="promo-grid">
              {PROMO.map((p) => (
                <Btn
                  key={p.t}
                  size="big"
                  className="piece-btn"
                  onClick={() => {
                    const pr = promo;
                    setPromo(null);
                    if (pr.uid) usePerk(pr.uid, pr.from, pr.to, p.t);
                    else move(pr.from, pr.to, p.t);
                  }}
                >
                  <span>{p.glyph}</span>
                  <small>{p.name}</small>
                </Btn>
              ))}
            </div>
          </Modal>
        )}
        {ending && <EndModal session={session} mirror onClose={() => setEnding(false)} />}
      </AnimatePresence>
    </div>
  );
}

function EndModal({ session, mirror, onClose }: { session: Session; mirror?: boolean; onClose: () => void }) {
  const finishWith = (winner: Side | 'draw', reason: string) => {
    act((s) => endChess(s, winner, reason));
    onClose();
  };
  return (
    <Modal title={mirror ? 'Партия кончается досрочно?' : 'Чем кончилась партия?'} onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        {(['w', 'b'] as Side[]).map((side) => {
          const p = player(session, idOf(session, side));
          return (
            <div key={side} className="row wrap" style={{ gap: 8 }}>
              <span className="grow label" style={{ color: p.color, minWidth: 140 }}>
                {p.name} ({sideName(side).toLowerCase()}) побеждает:
              </span>
              {!mirror && (
                <Btn size="small" variant="gold" onClick={() => finishWith(side, 'мат')}>
                  Мат
                </Btn>
              )}
              <Btn size="small" onClick={() => finishWith(side, 'соперник сдался')}>
                Сдача
              </Btn>
              <Btn size="small" onClick={() => finishWith(side, 'флаг')}>
                Время
              </Btn>
            </div>
          );
        })}
        <Btn block onClick={() => finishWith('draw', mirror ? 'по соглашению' : 'по соглашению или пат')}>
          Ничья
        </Btn>
      </div>
    </Modal>
  );
}

// ── Real mode: a physical board, the app keeps time and events ─

function RealBoard({ session }: { session: Session }) {
  const g = chess(session);
  const [ending, setEnding] = useState(false);
  const announce = useNav((s) => s.announce);
  const px = usePx();
  const { now, resend } = useChessClock(session);

  const resendRef = useRef(resend);
  resendRef.current = resend;
  useEffect(() => {
    const syncReal = () => fx({ type: 'chess.sync', fen: g.fen, check: null, mirror: false });
    syncReal();
    return onScene((e) => {
      if (e.type === 'scene.ready' && e.id === 'chess') {
        syncReal();
        resendRef.current();
      }
    });
  }, []);

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
                {active ? (g.clock.enabled && !g.clock.running ? 'нажми, чтобы запустить часы' : 'сделал ход — жми') : ' '}
                {rate !== 1 && <b style={{ color: rate < 1 ? '#8ff0ff' : '#ff6050' }}> · время ×{rate}</b>}
              </div>
              <div className="clock-captured">
                {g.captured[side].map((k, i) => (
                  <span key={i}>{PIECE_GLYPH[k]}</span>
                ))}
              </div>
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
        <div className="grow faint chess-hint">{g.pending.length ? `В этом ходу: ${g.pending.join(', ')}` : 'Отметь события хода, потом жми свои часы'}</div>
        <Btn size="small" variant="primary" onClick={() => setEnding(true)}>
          Конец партии
        </Btn>
      </div>

      <AnimatePresence>{ending && <EndModal session={session} onClose={() => setEnding(false)} />}</AnimatePresence>
    </div>
  );
}
