import type { Session, SessionPlayer } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, spendEffect, tickPerks } from '../../core/session';
import { type Dart, type DartsGame, dartFace, dartLabel } from './state';

export const darts = (s: Session) => s.game as DartsGame;

export interface TurnMods {
  mult: number;
  zero: boolean;
  bullUp: boolean;
  firstSingle: number;
  cursed: number[];
  shield: boolean;
}

export function turnMods(p: SessionPlayer): TurnMods {
  let mult = 1;
  for (const e of effects(p, 'darts.mult')) mult *= e.def.effect?.value ?? 1;
  let firstSingle = 1;
  for (const e of effects(p, 'darts.firstSingle')) firstSingle = Math.max(firstSingle, e.def.effect?.value ?? 1);
  return {
    mult: Math.min(mult, 4),
    zero: effects(p, 'darts.zero').length > 0,
    bullUp: effects(p, 'darts.bullUp').length > 0,
    firstSingle,
    cursed: effects(p, 'darts.cursedNum').map((e) => Number(e.perk.params?.n ?? 0)),
    shield: effects(p, 'darts.bustShield').length > 0,
  };
}

export function dartsAllowed(p: SessionPlayer): number {
  let n = 3;
  for (const e of effects(p, 'darts.dartDelta')) n += e.def.effect?.value ?? 0;
  return Math.max(1, Math.min(5, n));
}

interface Valued {
  value: number;
  isDouble: boolean;
  note?: string;
}

export function valueDarts(list: Dart[], mods: TurnMods): Valued[] {
  let upgradeLeft = mods.firstSingle > 1;
  return list.map((d) => {
    if (d.n === 0) return { value: 0, isDouble: false };
    if (mods.cursed.includes(d.n)) return { value: 0, isDouble: false, note: `сектор ${d.n} проклят` };
    if (d.n === 25) {
      const m = mods.bullUp ? 2 : d.m;
      return { value: 25 * m, isDouble: m === 2, note: mods.bullUp && d.m === 1 ? 'бычий глаз' : undefined };
    }
    if (d.m === 1 && upgradeLeft) {
      upgradeLeft = false;
      const m = mods.firstSingle;
      return { value: d.n * m, isDouble: m === 2, note: m === 3 ? 'тройная корона' : 'кольцо силы' };
    }
    return { value: d.n * d.m, isDouble: d.m === 2 };
  });
}

export interface TurnResolution {
  scored: number;
  newScore: number;
  bust: boolean;
  finished: boolean;
  usesShield: boolean;
  /** Turn must end now (bust or checkout). */
  ends: boolean;
  notes: string[];
}

/** Pure resolution of a (possibly partial) turn. */
export function resolveTurn(g: DartsGame, score: number, list: Dart[], mods: TurnMods): TurnResolution {
  const valued = valueDarts(list, mods);
  const notes = Array.from(new Set(valued.map((v) => v.note).filter(Boolean) as string[]));
  if (mods.zero) notes.push('пустая душа: очки сгорают');
  const values = valued.map((v) => (mods.zero ? 0 : v.value));

  if (g.mode === 'rounds') {
    const scored = values.reduce((sum, v) => sum + Math.floor(v * mods.mult), 0);
    if (mods.mult !== 1 && scored > 0) notes.push(`множитель ×${mods.mult}`);
    return { scored, newScore: score + scored, bust: false, finished: false, usesShield: false, ends: false, notes };
  }

  const run = (mult: number) => {
    let running = score;
    for (let i = 0; i < values.length; i++) {
      const pts = Math.floor(values[i] * mult);
      const next = running - pts;
      const bust = next < 0 || (g.doubleOut && next === 1) || (next === 0 && g.doubleOut && !valued[i].isDouble);
      if (bust) return { running, bustAt: i, finished: false };
      if (next === 0) return { running: 0, bustAt: -1, finished: true };
      running = next;
    }
    return { running, bustAt: -1, finished: false };
  };

  let r = run(mods.mult);
  if (r.bustAt >= 0 && mods.mult > 1) {
    const plain = run(1);
    if (plain.bustAt < 0) {
      r = plain;
      notes.push('множитель сгорел, иначе перебор');
    }
  } else if (mods.mult !== 1 && r.running !== score) {
    notes.push(`множитель ×${mods.mult}`);
  }

  if (r.bustAt >= 0) {
    if (mods.shield) {
      notes.push('щит поглотил перебор');
      return { scored: score - r.running, newScore: r.running, bust: false, finished: false, usesShield: true, ends: true, notes };
    }
    return { scored: 0, newScore: score, bust: true, finished: false, usesShield: false, ends: true, notes };
  }
  return {
    scored: score - r.running,
    newScore: r.running,
    bust: false,
    finished: r.finished,
    usesShield: false,
    ends: r.finished,
    notes,
  };
}

/** Souls earned for a turn, based on the raw darts (perks don't inflate income). */
export function turnIncome(list: Dart[]): { amount: number; reason: string } | null {
  const raw = list.reduce((sum, d) => sum + dartFace(d), 0);
  const bulls = list.filter((d) => d.n === 25).length;
  let amount = 0;
  const why: string[] = [];
  if (raw === 180) {
    amount += 5;
    why.push('ТОН-80!');
  } else if (raw >= 140) {
    amount += 3;
    why.push(`${raw} за ход`);
  } else if (raw >= 100) {
    amount += 2;
    why.push(`сотня (${raw})`);
  } else if (raw >= 60) {
    amount += 1;
    why.push(`${raw} за ход`);
  }
  if (bulls) {
    amount += bulls;
    why.push(bulls > 1 ? `${bulls} быка` : 'бык');
  }
  return amount > 0 ? { amount, reason: why.join(', ') } : null;
}

export const currentId = (s: Session) => darts(s).order[darts(s).current];

export function addDart(s: Session, dart: Dart) {
  if (s.status !== 'playing') return;
  const g = darts(s);
  const pid = currentId(s);
  const p = player(s, pid);
  g.turn.push(dart);
  const res = resolveTurn(g, g.scores[pid], g.turn, turnMods(p));
  if (res.ends || g.turn.length >= dartsAllowed(p)) commitTurn(s);
}

export function undoDart(s: Session) {
  darts(s).turn.pop();
}

export function commitTurn(s: Session) {
  if (s.status !== 'playing') return;
  const g = darts(s);
  const pid = currentId(s);
  const p = player(s, pid);
  const list = g.turn.slice();
  const res = resolveTurn(g, g.scores[pid], list, turnMods(p));
  if (res.usesShield) spendEffect(s, pid, 'darts.bustShield');
  g.scores[pid] = res.newScore;
  g.history.push({
    playerId: pid,
    round: g.round,
    darts: list,
    scored: res.scored,
    bust: res.bust,
    finished: res.finished,
    notes: res.notes,
  });

  const shown = list.length ? list.map(dartLabel).join(' · ') : 'без бросков';
  const extra = res.notes.length ? ` (${res.notes.join('; ')})` : '';
  if (res.bust) log(s, `${p.name}: ПЕРЕБОР! ${shown}${extra}`, 'bad');
  else log(s, `${p.name}: ${shown} = ${res.scored}${extra}`, res.scored >= 100 ? 'good' : 'info');

  if (!res.bust) {
    const income = turnIncome(list);
    if (income) awardSouls(s, pid, income.amount, income.reason);
  }

  tickPerks(s, [pid], 'turn');
  s.turnNo += 1;
  g.turn = [];

  if (res.finished) {
    g.winnerId = pid;
    log(s, `${p.name} закрывает партию! Чекаут ${res.scored}.`, 'epic');
    finish(s, dartsLogic.standings(s));
    return;
  }

  g.current += 1;
  if (g.current >= g.order.length) {
    g.current = 0;
    endRound(s);
  }
}

function endRound(s: Session) {
  const g = darts(s);
  if (g.maxRounds > 0 && g.round >= g.maxRounds) {
    const st = dartsLogic.standings(s);
    g.winnerId = st[0];
    log(s, `Раунды кончились. Побеждает ${player(s, st[0]).name}!`, 'epic');
    finish(s, st);
    return;
  }
  g.round += 1;
  if (g.order.length >= 2) {
    const st = dartsLogic.standings(s);
    const last = st[st.length - 1];
    if (g.scores[last] !== g.scores[st[0]]) awardSouls(s, last, 1, 'фора отстающему');
  }
  log(s, `— Раунд ${g.round} —`, 'system');
}

const avg = (s: Session, pid: string) => {
  const turns = darts(s).history.filter((t) => t.playerId === pid);
  if (!turns.length) return 0;
  return Math.round(turns.reduce((sum, t) => sum + t.scored, 0) / turns.length);
};

// ── Checkout hints (x01) ─────────────────────────────────────

interface Shot {
  label: string;
  value: number;
  isDouble: boolean;
}

const SHOTS: Shot[] = (() => {
  const out: Shot[] = [];
  for (let n = 20; n >= 1; n--) out.push({ label: `T${n}`, value: n * 3, isDouble: false });
  out.push({ label: 'Яблочко', value: 50, isDouble: true });
  for (let n = 20; n >= 1; n--) out.push({ label: `D${n}`, value: n * 2, isDouble: true });
  out.push({ label: '25', value: 25, isDouble: false });
  for (let n = 20; n >= 1; n--) out.push({ label: `${n}`, value: n, isDouble: false });
  return out;
})();

const FINISHERS = SHOTS.filter((s) => s.isDouble);
/** Without double-out the last dart prefers the plainest shot: singles, then doubles, then triples. */
const ANY_LAST = [...SHOTS.filter((s) => !s.isDouble && !s.label.startsWith('T')), ...FINISHERS, ...SHOTS.filter((s) => s.label.startsWith('T'))];

/** Suggested checkout for x01, or null when impossible in the darts left. */
export function checkoutHint(remaining: number, dartsLeft: number, doubleOut: boolean): string | null {
  if (remaining <= 0 || remaining > 180 || dartsLeft <= 0) return null;
  const last = doubleOut ? FINISHERS : ANY_LAST;
  for (const f of last) if (f.value === remaining) return f.label;
  if (dartsLeft >= 2)
    for (const a of SHOTS) for (const f of last) if (a.value + f.value === remaining) return `${a.label} ${f.label}`;
  if (dartsLeft >= 3)
    for (const a of SHOTS)
      for (const b of SHOTS)
        for (const f of last) if (a.value + b.value + f.value === remaining) return `${a.label} ${b.label} ${f.label}`;
  return null;
}

export const dartsLogic: GameLogic = {
  id: 'darts',
  createGame(players, opts) {
    const mode = (opts.mode as DartsGame['mode']) ?? 'x01';
    const start = Number(opts.start ?? 301);
    const game: DartsGame = {
      mode,
      start,
      doubleOut: Boolean(opts.doubleOut ?? false),
      maxRounds: Number(mode === 'rounds' ? opts.rounds ?? 8 : opts.cap ?? 0),
      order: players.map((p) => p.id),
      current: 0,
      round: 1,
      scores: Object.fromEntries(players.map((p) => [p.id, mode === 'x01' ? start : 0])),
      turn: [],
      history: [],
    };
    return game;
  },
  currentPlayerId: (s) => (s.status === 'playing' ? currentId(s) : null),
  standings(s) {
    const g = darts(s);
    const ids = g.order.slice();
    const key = (id: string) => (g.mode === 'x01' ? g.scores[id] : -g.scores[id]);
    ids.sort((a, b) => key(a) - key(b) || g.order.indexOf(a) - g.order.indexOf(b));
    if (g.winnerId) return [g.winnerId, ...ids.filter((i) => i !== g.winnerId)];
    return ids;
  },
  scoreView(s, pid) {
    const g = darts(s);
    const a = avg(s, pid);
    return { main: String(g.scores[pid]), sub: a ? `ср. ${a}` : g.mode === 'x01' ? 'осталось' : 'очков' };
  },
  shrineAccess(s, pid) {
    if (s.status !== 'playing') return 'Игра окончена';
    if (currentId(s) !== pid) return 'Алтарь открыт только перед своим ходом';
    if (darts(s).turn.length > 0) return 'Ход уже начат — алтарь закрыт до следующего хода';
    return null;
  },
  applyInstant(s, pid, def) {
    if (def.effect?.tag !== 'darts.pushLeader') return;
    const g = darts(s);
    const st = dartsLogic.standings(s).filter((id) => id !== pid);
    const target = st[0];
    if (!target) return;
    const v = def.effect.value ?? 40;
    if (g.mode === 'x01') g.scores[target] = Math.min(g.start, g.scores[target] + v);
    else g.scores[target] = Math.max(0, g.scores[target] - v);
    return `Буря накрывает ${player(s, target).name}: ${g.mode === 'x01' ? '+' : '−'}${v}`;
  },
  status(s) {
    const g = darts(s);
    const mode = g.mode === 'x01' ? `${g.start}${g.doubleOut ? ' · дабл-аут' : ''}` : 'Охота';
    return `${mode} · Раунд ${g.round}${g.maxRounds ? ` / ${g.maxRounds}` : ''}`;
  },
};
