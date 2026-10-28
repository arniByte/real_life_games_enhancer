import type { Session } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, tickPerks } from '../../core/session';
import { type ChessGame, type PieceKind, type Side, PIECE_NAME, PIECE_VALUE, otherSide, sideName } from './state';

export const chess = (s: Session) => s.game as ChessGame;

const CAPTURE_SOULS: Record<PieceKind, number> = { p: 1, n: 2, b: 2, r: 3, q: 5 };
const REVENGE_SOULS: Record<PieceKind, number> = { p: 0, n: 1, b: 1, r: 1, q: 2 };

export const sideOf = (s: Session, pid: string): Side => (chess(s).sides.w === pid ? 'w' : 'b');
export const idOf = (s: Session, side: Side) => chess(s).sides[side];

export function clockRate(s: Session, side: Side): number {
  let rate = 1;
  for (const e of effects(player(s, idOf(s, side)), 'chess.clockRate')) rate *= e.def.effect?.value ?? 1;
  return rate;
}

/** Remaining ms for a side right now (accounts for the running side). */
export function remainingMs(s: Session, side: Side, now: number): number {
  const g = chess(s);
  const base = g.clock.remaining[side];
  if (!g.clock.running || g.toMove !== side || g.clock.startedAt == null) return base;
  return base - (now - g.clock.startedAt) * clockRate(s, side);
}

/** Bank elapsed time of the running side so rate changes apply from now on. */
export function syncClock(s: Session, now = Date.now()) {
  const g = chess(s);
  if (!g.clock.running || g.clock.startedAt == null) return;
  g.clock.remaining[g.toMove] = remainingMs(s, g.toMove, now);
  g.clock.startedAt = now;
}

export function startClock(s: Session, now = Date.now()) {
  const g = chess(s);
  if (!g.clock.enabled || g.result) return;
  g.clock.running = true;
  g.clock.startedAt = now;
}

export function pauseClock(s: Session, now = Date.now()) {
  const g = chess(s);
  syncClock(s, now);
  g.clock.running = false;
  g.clock.startedAt = null;
}

export function registerCapture(s: Session, kind: PieceKind) {
  const g = chess(s);
  if (g.result) return;
  const side = g.toMove;
  g.captured[side].push(kind);
  g.pending.push(`взятие: ${PIECE_NAME[kind]}`);
  const me = idOf(s, side);
  const foe = idOf(s, otherSide(side));
  log(s, `${player(s, me).name} берёт ${PIECE_NAME[kind]}`, kind === 'q' ? 'good' : 'info');
  awardSouls(s, me, CAPTURE_SOULS[kind], `взятие (${PIECE_NAME[kind]})`);
  if (REVENGE_SOULS[kind]) awardSouls(s, foe, REVENGE_SOULS[kind], 'жажда мести');
}

export function registerCheck(s: Session) {
  const g = chess(s);
  if (g.result || g.checkGiven) return;
  g.checkGiven = true;
  g.pending.push('шах');
  const me = idOf(s, g.toMove);
  log(s, `${player(s, me).name}: Шах!`, 'good');
  awardSouls(s, me, 1, 'шах');
}

export function registerPromotion(s: Session) {
  const g = chess(s);
  if (g.result) return;
  g.pending.push('превращение');
  const me = idOf(s, g.toMove);
  log(s, `${player(s, me).name}: пешка коронована!`, 'epic');
  awardSouls(s, me, 3, 'превращение пешки');
}

export function registerCastle(s: Session) {
  const g = chess(s);
  if (g.result || g.pending.includes('рокировка')) return;
  g.pending.push('рокировка');
  const me = idOf(s, g.toMove);
  log(s, `${player(s, me).name} прячет короля в башне`, 'info');
  awardSouls(s, me, 1, 'рокировка');
}

/** The mover hits the clock: their move is done. */
export function hitClock(s: Session, now = Date.now()) {
  const g = chess(s);
  if (g.result) return;
  const side = g.toMove;
  const pid = idOf(s, side);
  if (g.clock.enabled && g.clock.running) {
    g.clock.remaining[side] = remainingMs(s, side, now) + g.clock.incMs;
  }
  tickPerks(s, [pid], 'turn');
  s.turnNo += 1;
  g.toMove = otherSide(side);
  if (g.toMove === 'w') g.moveNo += 1;
  g.pending = [];
  g.checkGiven = false;
  if (g.clock.enabled) {
    g.clock.running = true;
    g.clock.startedAt = now;
  }
}

export function endChess(s: Session, winner: Side | 'draw', reason: string) {
  const g = chess(s);
  if (g.result) return;
  pauseClock(s);
  g.result = { winner, reason };
  if (winner === 'draw') log(s, `Ничья — ${reason}.`, 'epic');
  else log(s, `${player(s, idOf(s, winner)).name} (${sideName(winner).toLowerCase()}) побеждает — ${reason}!`, 'epic');
  finish(s, chessLogic.standings(s));
}

export const material = (g: ChessGame, side: Side) => g.captured[side].reduce((sum, k) => sum + PIECE_VALUE[k], 0);

export const chessLogic: GameLogic = {
  id: 'chess',
  createGame(players, opts) {
    const control = String(opts.clock ?? '5+3');
    const [base, inc] = control === 'none' ? [0, 0] : control.split('+').map(Number);
    const game: ChessGame = {
      sides: { w: players[0].id, b: players[1].id },
      toMove: 'w',
      moveNo: 1,
      clock: {
        enabled: control !== 'none',
        baseMs: base * 60_000,
        incMs: inc * 1000,
        remaining: { w: base * 60_000, b: base * 60_000 },
        running: false,
        startedAt: null,
      },
      captured: { w: [], b: [] },
      pending: [],
      checkGiven: false,
    };
    return game;
  },
  currentPlayerId: (s) => (s.status === 'playing' ? idOf(s, chess(s).toMove) : null),
  standings(s) {
    const g = chess(s);
    if (g.result && g.result.winner !== 'draw') {
      const w = g.result.winner;
      return [idOf(s, w), idOf(s, otherSide(w))];
    }
    return (['w', 'b'] as Side[])
      .sort((a, b) => material(g, b) - material(g, a))
      .map((side) => idOf(s, side));
  },
  scoreView(s, pid) {
    const g = chess(s);
    const side = sideOf(s, pid);
    const diff = material(g, side) - material(g, otherSide(side));
    return { main: diff > 0 ? `+${diff}` : String(diff), sub: sideName(side) };
  },
  shrineAccess(s, pid) {
    if (s.status !== 'playing') return 'Партия окончена';
    if (idOf(s, chess(s).toMove) !== pid) return 'Алтарь открыт только в свой ход — и часы тикают';
    return null;
  },
  applyInstant(s, pid, def) {
    const g = chess(s);
    if (!g.clock.enabled) return;
    const side = sideOf(s, pid);
    const v = (def.effect?.value ?? 0) * 1000;
    syncClock(s);
    if (def.effect?.tag === 'chess.clockSelf') {
      g.clock.remaining[side] = Math.max(1000, g.clock.remaining[side] + v);
      return `${player(s, pid).name}: ${v > 0 ? '+' : '−'}${Math.abs(v / 1000)} сек`;
    }
    if (def.effect?.tag === 'chess.steal') {
      const foe = otherSide(side);
      g.clock.remaining[foe] = Math.max(1000, g.clock.remaining[foe] - v);
      g.clock.remaining[side] += v;
      return `${player(s, pid).name} крадёт ${v / 1000} сек у соперника`;
    }
  },
  status(s) {
    const g = chess(s);
    if (g.result) return g.result.winner === 'draw' ? 'Ничья' : `Победа: ${sideName(g.result.winner).toLowerCase()}`;
    return `Ход ${g.moveNo} · ходят ${sideName(g.toMove).toLowerCase()}`;
  },
  beforeShrine: (s) => syncClock(s),
  onResume(s) {
    const g = chess(s);
    if (g.clock.running) {
      g.clock.running = false;
      g.clock.startedAt = null;
    }
  },
};
