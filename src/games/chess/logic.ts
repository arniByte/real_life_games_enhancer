import { Chess, type Move, type Square } from 'chess.js';
import type { Session } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, spendCharge, tickPerks } from '../../core/session';
import { perkDef } from '../../core/perks/registry';
import { type ChessGame, type PieceKind, type Side, PIECE_NAME, PIECE_VALUE, otherSide, sideName } from './state';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
      mode: opts.board === 'real' ? 'real' : 'mirror',
      fen: START_FEN,
      moves: [],
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

// ── Mirror mode: moves played on the 3D board ────────────────

const load = (fen: string) => new Chess(fen, { skipValidation: true });

const STONE: Record<string, PieceKind[]> = { кони: ['n'], слоны: ['b'], ладьи: ['r'] };

/** Legal moves for the side to move, filtered by that player's active curses. */
export function legalMoves(s: Session, from?: string): Move[] {
  const g = chess(s);
  const c = load(g.fen);
  const all = c.moves({ verbose: true, ...(from ? { square: from as Square } : {}) }) as Move[];
  const p = player(s, idOf(s, g.toMove));
  const curses = p.perks.filter((k) => k.kind === 'curse');
  let list = all;
  for (const k of curses) {
    switch (k.defId) {
      case 'c_icefile':
        list = list.filter((m) => m.from[0] !== k.params?.file);
        break;
      case 'c_stone':
        list = list.filter((m) => !(STONE[k.params?.piece ?? ''] ?? []).includes(m.piece as PieceKind));
        break;
      case 'c_shadowqueen':
        list = list.filter(
          (m) => m.piece !== 'q' || (Math.abs(m.from.charCodeAt(0) - m.to.charCodeAt(0)) <= 1 && Math.abs(Number(m.from[1]) - Number(m.to[1])) <= 1),
        );
        break;
      case 'c_nocastle':
        list = list.filter((m) => !m.flags.includes('k') && !m.flags.includes('q'));
        break;
      case 'c_pacifist': {
        const quiet = list.filter((m) => !m.captured);
        if (quiet.length) list = quiet;
        break;
      }
    }
  }
  // Curses never leave a player without a move.
  if (!list.length && !from) return all;
  if (!list.length && from) {
    const anyLegal = legalMoves(s).length > 0;
    return anyLegal ? [] : all;
  }
  return list;
}

export interface MoveOutcome {
  from: string;
  to: string;
  piece: string;
  color: Side;
  captured?: string;
  /** Square of the captured piece (differs from `to` on en passant). */
  capturedAt?: string;
  castle?: { rookFrom: string; rookTo: string };
  promotion?: string;
  swap?: boolean;
  check: boolean;
  mate: boolean;
  san: string;
}

function afterMove(s: Session, c: Chess, out: MoveOutcome, now: number) {
  const g = chess(s);
  const side = g.toMove;
  if (out.check) registerCheck(s);
  g.lastMove = { from: out.from, to: out.to };
  g.moves.push({ san: out.san, side, from: out.from, to: out.to });
  if (c.isCheckmate()) {
    g.fen = c.fen();
    endChess(s, side, 'мат');
    return;
  }
  if (c.isStalemate()) {
    g.fen = c.fen();
    endChess(s, 'draw', 'пат');
    return;
  }
  if (c.isInsufficientMaterial()) {
    g.fen = c.fen();
    endChess(s, 'draw', 'не хватает материала для мата');
    return;
  }
  if (c.isThreefoldRepetition() || c.isDraw()) {
    g.fen = c.fen();
    endChess(s, 'draw', 'троекратное повторение / правило 50 ходов');
    return;
  }
  if (g.extraMove) {
    // «Двойной ход»: the same side moves again.
    g.extraMove = false;
    g.fen = withTurn(c.fen(), side);
    log(s, `${player(s, idOf(s, side)).name} ходит ещё раз`, 'epic');
    return;
  }
  g.fen = c.fen();
  hitClock(s, now);
}

/** Replace the side-to-move and clear en passant in a FEN. */
function withTurn(fen: string, side: Side): string {
  const parts = fen.split(' ');
  parts[1] = side;
  parts[3] = '-';
  return parts.join(' ');
}

/** Play a normal move. Returns null when illegal (or forbidden by a curse). */
export function playMove(s: Session, from: string, to: string, promotion = 'q', now = Date.now()): MoveOutcome | null {
  const g = chess(s);
  if (g.result || g.mode !== 'mirror') return null;
  const allowed = legalMoves(s, from).find((m) => m.to === to);
  if (!allowed) return null;
  const c = load(g.fen);
  const m = c.move({ from, to, promotion }) as Move;
  const out: MoveOutcome = {
    from,
    to,
    piece: m.piece,
    color: m.color as Side,
    captured: m.captured,
    capturedAt: m.captured ? (m.flags.includes('e') ? `${to[0]}${from[1]}` : to) : undefined,
    promotion: m.promotion,
    check: c.inCheck(),
    mate: c.isCheckmate(),
    san: m.san,
  };
  if (m.flags.includes('k')) out.castle = { rookFrom: `h${from[1]}`, rookTo: `f${from[1]}` };
  if (m.flags.includes('q')) out.castle = { rookFrom: `a${from[1]}`, rookTo: `d${from[1]}` };
  if (m.captured) registerCapture(s, m.captured as PieceKind);
  if (out.castle) registerCastle(s);
  if (m.promotion) registerPromotion(s);
  afterMove(s, c, out, now);
  return out;
}

/** Perks that unlock special moves on the 3D board. */
export const PERK_MOVES: Record<string, 'free' | 'swap' | 'promote' | 'rise' | 'remove'> = {
  c_dash: 'free',
  c_retreat: 'free',
  c_leap: 'free',
  c_kingstep: 'free',
  c_soulswap: 'swap',
  c_coronation: 'promote',
  c_rise: 'rise',
  c_tribute: 'remove',
};

/**
 * A move granted by a perk. The table trusts the player to respect the perk's wording;
 * the app only blocks the obviously impossible (moving the foe's pieces, taking a king).
 */
export function perkMove(s: Session, uid: string, from: string, to: string, now = Date.now(), promo = 'q'): MoveOutcome | null {
  const g = chess(s);
  if (g.result || g.mode !== 'mirror') return null;
  const side = g.toMove;
  const pid = idOf(s, side);
  const perk = player(s, pid).perks.find((k) => k.uid === uid);
  const kind = perk && PERK_MOVES[perk.defId];
  if (!perk || !kind) return null;
  const c = load(g.fen);
  const piece = c.get(from as Square);
  const target = c.get(to as Square);
  let out: MoveOutcome;

  if (kind === 'remove') {
    // «Дань»: the foe picks one of your pawns and it leaves the board. Not a move.
    if (!piece || piece.color !== side || piece.type !== 'p') return null;
    c.remove(from as Square);
    g.captured[otherSide(side)].push('p');
    spendCharge(s, pid, uid, true);
    log(s, `${player(s, pid).name} платит «Дань»: пешка ${from} снята`, 'bad');
    g.fen = c.fen();
    return { from, to: from, piece: 'p', color: side, captured: 'p', capturedAt: from, check: false, mate: false, san: `${from}✕` };
  }

  if (kind === 'rise') {
    const rank = side === 'w' ? '2' : '7';
    if (target || to[1] !== rank || !g.captured[otherSide(side)].includes('p')) return null;
    c.put({ type: 'p', color: side }, to as Square);
    g.captured[otherSide(side)].splice(g.captured[otherSide(side)].indexOf('p'), 1);
    out = { from: to, to, piece: 'p', color: side, check: false, mate: false, san: `${to}✝` };
  } else if (kind === 'promote') {
    if (!piece || piece.color !== side || piece.type !== 'p' || from !== to) return null;
    const type = (['q', 'r', 'b', 'n'].includes(promo) ? promo : 'q') as 'q' | 'r' | 'b' | 'n';
    c.remove(from as Square);
    c.put({ type, color: side }, from as Square);
    registerPromotion(s);
    out = { from, to, piece: 'p', color: side, promotion: type, check: false, mate: false, san: `${from}=${type.toUpperCase()}` };
  } else {
    if (!piece || piece.color !== side || from === to) return null;
    if (target?.type === 'k') return null;
    if (kind === 'swap') {
      if (!target || target.color !== side || piece.type === 'k') return null;
      c.remove(from as Square);
      c.remove(to as Square);
      c.put(piece, to as Square);
      c.put(target, from as Square);
      out = { from, to, piece: piece.type, color: side, swap: true, check: false, mate: false, san: `${from}⇄${to}` };
    } else {
      if (target && target.color === side) return null;
      c.remove(from as Square);
      if (target) c.remove(to as Square);
      c.put(piece, to as Square);
      out = { from, to, piece: piece.type, color: side, captured: target?.type, capturedAt: target ? to : undefined, check: false, mate: false, san: `${from}~${to}` };
      if (target) registerCapture(s, target.type as PieceKind);
    }
  }
  const def = perkDef(perk.defId);
  spendCharge(s, pid, uid, true);
  log(s, `${player(s, pid).name} применяет «${def.name}»`, 'epic');
  // Pass the turn by hand: chess.js won't move for us after free placement.
  const next = load(withTurn(c.fen(), otherSide(side)));
  out.check = next.inCheck();
  out.mate = next.isCheckmate();
  const forAfter = next;
  // afterMove expects `c` to reflect the position with the opponent to move.
  afterMove(s, forAfter, out, now);
  return out;
}

/** «Двойной ход»: arm an extra move for the side to move. */
export function armTwin(s: Session, uid: string) {
  const g = chess(s);
  const pid = idOf(s, g.toMove);
  if (!player(s, pid).perks.some((k) => k.uid === uid && k.defId === 'c_twin')) return;
  spendCharge(s, pid, uid, true);
  g.extraMove = true;
  log(s, `${player(s, pid).name}: «Двойной ход» — следующий ход без передачи очереди`, 'epic');
}

/** What stands on a square right now. */
export function pieceAt(s: Session, sq: string): { type: string; color: Side } | null {
  const p = load(chess(s).fen).get(sq as Square);
  return p ? { type: p.type, color: p.color as Side } : null;
}

/** Square of the king that is in check (side to move), if any. */
export function checkSquare(s: Session): string | null {
  const c = load(chess(s).fen);
  if (!c.inCheck()) return null;
  const turn = c.turn();
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
  return null;
}

/** A pawn reaching the last rank needs a piece chosen. */
export function isPromotion(s: Session, from: string, to: string): boolean {
  const p = pieceAt(s, from);
  return !!p && p.type === 'p' && (to[1] === '8' || to[1] === '1');
}

const sqName = (f: number, r: number) => (f >= 0 && f < 8 && r >= 1 && r <= 8 ? `${'abcdefgh'[f]}${r}` : null);

/**
 * Squares to light up for a perk move: with no `from`, the pieces that may use it;
 * with `from`, where that piece may go. A guide, not a referee — the table trusts the wording.
 */
export function perkTargets(s: Session, uid: string, from: string | null): string[] {
  const g = chess(s);
  const side = g.toMove;
  const perk = player(s, idOf(s, side)).perks.find((k) => k.uid === uid);
  const kind = perk && PERK_MOVES[perk.defId];
  if (!perk || !kind) return [];
  const c = load(g.fen);
  const own = (sq: string | null) => {
    const p = sq ? c.get(sq as Square) : null;
    return p && p.color === side ? p : null;
  };
  const empty = (sq: string | null) => !!sq && !c.get(sq as Square);
  const enterable = (sq: string | null) => {
    if (!sq) return false;
    const p = c.get(sq as Square);
    return !p || (p.color !== side && p.type !== 'k');
  };
  const dir = side === 'w' ? 1 : -1;
  const all: string[] = [];
  for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) all.push(sqName(f, r)!);

  if (kind === 'rise') return g.captured[otherSide(side)].includes('p') ? all.filter((sq) => sq[1] === (side === 'w' ? '2' : '7') && empty(sq)) : [];
  if (kind === 'remove') return all.filter((sq) => own(sq)?.type === 'p');
  if (kind === 'promote') return all.filter((sq) => own(sq)?.type === 'p' && sq[1] === (side === 'w' ? '6' : '3'));

  const id = perk.defId;
  const canUse = (sq: string) => {
    const p = own(sq);
    if (!p) return false;
    if (id === 'c_dash' || id === 'c_retreat') return p.type === 'p';
    if (id === 'c_kingstep') return p.type === 'k';
    return p.type !== 'k';
  };
  if (!from) return all.filter(canUse);
  if (!canUse(from)) return [];
  const f = from.charCodeAt(0) - 97;
  const r = Number(from[1]);
  switch (id) {
    case 'c_dash': {
      const mid = sqName(f, r + dir);
      const to = sqName(f, r + 2 * dir);
      return empty(mid) && empty(to) ? [to!] : [];
    }
    case 'c_retreat': {
      const to = sqName(f, r - dir);
      return empty(to) ? [to!] : [];
    }
    case 'c_leap':
      return [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
        .map(([df, dr]) => sqName(f + df, r + dr))
        .filter((sq): sq is string => enterable(sq));
    case 'c_kingstep':
      return [[0, 1], [0, -1], [1, 0], [-1, 0]]
        .filter(([df, dr]) => empty(sqName(f + df, r + dr)) && enterable(sqName(f + 2 * df, r + 2 * dr)))
        .map(([df, dr]) => sqName(f + 2 * df, r + 2 * dr)!);
    case 'c_soulswap':
      return all.filter((sq) => sq !== from && own(sq) && own(sq)!.type !== 'k');
  }
  return [];
}
