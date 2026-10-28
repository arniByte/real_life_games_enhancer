// The Shrine: the soul economy. Wheel of Fortune, Blood Pact, Hex and Cleansing,
// plus the balance levers — catch-up odds, pity, slot caps and chaos levels.

import type {
  ActivePerk,
  ChaosLevel,
  PerkDef,
  PerkKind,
  Rarity,
  Session,
  SessionPlayer,
  ShrineResult,
  WheelOutcome,
} from './types';
import { ALL_PERKS, RARITY_ORDER, fillText, perkDef } from './perks/registry';
import { MAX_BLESSINGS, MAX_CURSES, effects, log, nextUid, player, souls, spendEffect } from './session';
import { nextRandom, pick, weightedPick } from './rng';
import { GAME_LOGIC } from '../games/logic';

export const COST = { wheel: 1, pact: 3, hex: 2, cleanse: 2 } as const;
export const JACKPOT_SOULS = 3;
export const PITY_AFTER = 2;

export const BASE_WHEEL: Record<WheelOutcome, number> = {
  bless_common: 34,
  bless_rare: 16,
  bless_epic: 6,
  bless_legendary: 1.5,
  curse_common: 20,
  curse_rare: 8,
  curse_epic: 2.5,
  void: 8,
  jackpot: 4,
};

export const OUTCOMES = Object.keys(BASE_WHEEL) as WheelOutcome[];

const CHAOS: Record<ChaosLevel, { curse: number; epic: number; legendary: number; jackpot: number; pactCurse: number }> = {
  calm: { curse: 0.5, epic: 0.8, legendary: 0.8, jackpot: 1, pactCurse: 0.25 },
  normal: { curse: 1, epic: 1, legendary: 1, jackpot: 1, pactCurse: 0.4 },
  mayhem: { curse: 1.4, epic: 1.8, legendary: 2.2, jackpot: 1.5, pactCurse: 0.55 },
};

export const CHAOS_LABEL: Record<ChaosLevel, string> = {
  calm: 'Тихий омут',
  normal: 'Сумерки',
  mayhem: 'Безумие',
};

export const OUTCOME_LABEL: Record<WheelOutcome, string> = {
  bless_common: 'Искра',
  bless_rare: 'Знамение',
  bless_epic: 'Чудо',
  bless_legendary: 'Божество',
  curse_common: 'Порча',
  curse_rare: 'Проклятие',
  curse_epic: 'Рок',
  void: 'Пустота',
  jackpot: 'Джекпот',
};

const outcomeKind = (o: WheelOutcome): PerkKind | null =>
  o.startsWith('bless') ? 'blessing' : o.startsWith('curse') ? 'curse' : null;
const outcomeRarity = (o: WheelOutcome): Rarity => o.split('_')[1] as Rarity;

/** 0 = leader … 1 = last place. 0.5 when there is no meaningful order. */
export function placeFactor(s: Session, pid: string): number {
  const st = GAME_LOGIC[s.gameId].standings(s);
  if (st.length < 2) return 0.5;
  return st.indexOf(pid) / (st.length - 1);
}

export function isLeader(s: Session, pid: string) {
  return s.players.length > 1 && GAME_LOGIC[s.gameId].standings(s)[0] === pid;
}

export function isLast(s: Session, pid: string) {
  const st = GAME_LOGIC[s.gameId].standings(s);
  return st.length > 1 && st[st.length - 1] === pid;
}

/** Normalized wheel odds (sum = 1) for a player right now. */
export function wheelOdds(s: Session, pid: string): Record<WheelOutcome, number> {
  const c = CHAOS[s.enhancer.chaos];
  const p = player(s, pid);
  const place = placeFactor(s, pid);
  const curseMul = (1.25 - 0.6 * place) * c.curse * (p.doom >= PITY_AFTER ? 0 : 1);
  const rareMul = 0.85 + 0.5 * place;
  const w: Record<WheelOutcome, number> = { ...BASE_WHEEL };
  w.bless_rare *= rareMul;
  w.bless_epic *= rareMul * c.epic;
  w.bless_legendary *= rareMul * c.legendary;
  w.curse_common *= curseMul;
  w.curse_rare *= curseMul;
  w.curse_epic *= curseMul * c.epic;
  w.jackpot *= c.jackpot;
  const total = OUTCOMES.reduce((sum, o) => sum + w[o], 0);
  for (const o of OUTCOMES) w[o] /= total;
  return w;
}

// ── Costs & access ───────────────────────────────────────────

export function wheelCost(s: Session, pid: string): number {
  const p = player(s, pid);
  if (effects(p, 'wheel.free').length) return 0;
  return COST.wheel + effects(p, 'wheel.tax').reduce((sum, e) => sum + (e.def.effect?.value ?? 1), 0);
}

export function hexCost(s: Session, casterId: string, targetId: string): number {
  let cost: number = COST.hex;
  if (isLeader(s, targetId) && !isLeader(s, casterId)) cost -= 1;
  cost -= effects(player(s, targetId), 'hex.bait').reduce((sum, e) => sum + (e.def.effect?.value ?? 1), 0);
  return Math.max(1, cost);
}

export function curseCount(p: SessionPlayer) {
  return p.perks.filter((k) => k.kind === 'curse').length;
}

export function hexBlockReason(s: Session, casterId: string, targetId: string): string | null {
  if (casterId === targetId) return 'Себя сглазить нельзя';
  if (curseCount(player(s, targetId)) >= 2) return 'Пощада: на нём уже 2 проклятия';
  return null;
}

/** Why a player can't visit the shrine right now, or null. */
export function shrineBlock(s: Session, pid: string): string | null {
  if (!s.enhancer.enabled) return 'Режим чистого счёта: алтарь отключён';
  if (s.status !== 'playing') return 'Игра окончена';
  if (effects(player(s, pid), 'shrine.lock').length) return 'Печать изгнания: алтарь запечатан';
  return GAME_LOGIC[s.gameId].shrineAccess(s, pid);
}

// ── Perk drawing & granting ──────────────────────────────────

function eligible(s: Session, pid: string, kind: PerkKind, rarity: Rarity, exclude: Set<string>): PerkDef[] {
  return ALL_PERKS.filter(
    (d) =>
      (d.game === s.gameId || d.game === 'any') &&
      d.kind === kind &&
      d.rarity === rarity &&
      !exclude.has(d.id) &&
      (!d.requires || d.requires({ session: s, playerId: pid })),
  );
}

/** Draw a perk of the kind/rarity, falling back to lower rarities when a bucket is empty. */
export function drawPerk(s: Session, pid: string, kind: PerkKind, rarity: Rarity, exclude = new Set<string>()): PerkDef | null {
  for (let r = RARITY_ORDER.indexOf(rarity); r >= 0; r--) {
    const pool = eligible(s, pid, kind, RARITY_ORDER[r], exclude);
    if (pool.length) return weightedPick(s, pool, (d) => d.weight ?? 1);
  }
  return null;
}

function rollParams(s: Session, def: PerkDef): Record<string, string> | undefined {
  if (!def.params) return undefined;
  const out: Record<string, string> = {};
  for (const [k, values] of Object.entries(def.params)) out[k] = pick(s, values);
  return out;
}

/** Generic instant effects; game-specific ones are delegated to the game logic. */
function applyInstant(s: Session, pid: string, def: PerkDef, perk: ActivePerk): string | void {
  const p = player(s, pid);
  const v = def.effect?.value ?? 0;
  switch (def.effect?.tag) {
    case 'souls.gain':
      p.souls += v;
      p.stats.soulsEarned += v;
      return `${p.name} +${souls(v)}`;
    case 'souls.lose': {
      const lost = Math.min(p.souls, v);
      p.souls -= lost;
      return lost ? `${p.name} теряет ${souls(lost)}` : `${p.name}: карман и так пуст`;
    }
    case 'souls.halve': {
      const lost = Math.floor(p.souls / 2);
      p.souls -= lost;
      return `${p.name} теряет ${souls(lost)}`;
    }
    case 'souls.vampire': {
      const rich = s.players.filter((o) => o.id !== pid).sort((a, b) => b.souls - a.souls)[0];
      if (!rich || rich.souls === 0) {
        p.souls += 1;
        return `${p.name}: красть не у кого — тьма дарит 1 душу`;
      }
      const take = Math.min(rich.souls, v);
      rich.souls -= take;
      p.souls += take;
      return `${p.name} выпивает ${souls(take)} у ${rich.name}`;
    }
  }
  return GAME_LOGIC[s.gameId].applyInstant?.(s, pid, def, perk);
}

/** Give a perk to a player, handling instants, stacking and slot caps. */
export function grantPerk(s: Session, pid: string, def: PerkDef, params?: Record<string, string>, fromId?: string): ActivePerk {
  const p = player(s, pid);
  const perk: ActivePerk = {
    uid: nextUid(s),
    defId: def.id,
    kind: def.kind,
    left: def.duration.type === 'charges' || def.duration.type === 'ticks' ? def.duration.n : undefined,
    params: params ?? rollParams(s, def),
    fromId,
    bornAt: s.turnNo,
  };
  if (def.kind === 'blessing') p.stats.blessings += 1;
  else p.stats.curses += 1;

  if (def.duration.type === 'instant') {
    const line = applyInstant(s, pid, def, perk);
    if (line) log(s, line, def.kind === 'blessing' ? 'good' : 'bad');
    return perk;
  }

  // Same perk again: stack charges / refresh duration instead of taking a new slot.
  const same = p.perks.find((k) => k.defId === def.id && JSON.stringify(k.params) === JSON.stringify(perk.params));
  if (same && def.duration.type !== 'game') {
    same.left = def.duration.type === 'charges' ? (same.left ?? 0) + def.duration.n : Math.max(same.left ?? 0, def.duration.n);
    log(s, `${p.name}: «${def.name}» усиливается`, def.kind === 'blessing' ? 'good' : 'bad');
    return same;
  }
  if (same) return same;

  const cap = def.kind === 'blessing' ? MAX_BLESSINGS : MAX_CURSES;
  const sameKind = p.perks.filter((k) => k.kind === def.kind);
  if (sameKind.length >= cap) {
    const oldest = sameKind[0];
    p.perks.splice(p.perks.indexOf(oldest), 1);
    log(s, `${p.name}: «${perkDef(oldest.defId).name}» вытеснен — слоты полны`, 'system');
  }
  p.perks.push(perk);
  return perk;
}

function pay(s: Session, pid: string, cost: number) {
  const p = player(s, pid);
  if (p.souls < cost) throw new Error('Not enough souls');
  p.souls -= cost;
  p.stats.soulsSpent += cost;
}

function prepare(s: Session) {
  GAME_LOGIC[s.gameId].beforeShrine?.(s);
}

// ── Offerings ────────────────────────────────────────────────

export function spinWheel(s: Session, pid: string): ShrineResult {
  prepare(s);
  const p = player(s, pid);
  const cost = wheelCost(s, pid);
  const odds = wheelOdds(s, pid);
  if (cost === 0) spendEffect(s, pid, 'wheel.free');
  else pay(s, pid, cost);
  p.stats.spins += 1;

  const outcome = weightedPick(s, OUTCOMES, (o) => odds[o]);
  const result: ShrineResult = { type: 'wheel', outcome, gained: [], notes: [] };
  const kind = outcomeKind(outcome);

  if (kind) {
    const def = drawPerk(s, pid, kind, outcomeRarity(outcome));
    if (def) {
      const perk = grantPerk(s, pid, def);
      result.gained.push({ playerId: pid, perk });
      log(s, `${p.name} крутит Колесо: ${kind === 'blessing' ? 'дар' : 'проклятие'} «${def.name}»`, kind === 'blessing' ? 'good' : 'bad');
    }
    if (kind === 'curse') p.doom += 1;
    else p.doom = 0;
  } else if (outcome === 'jackpot') {
    p.souls += JACKPOT_SOULS;
    p.stats.soulsEarned += JACKPOT_SOULS;
    result.soulsDelta = JACKPOT_SOULS;
    result.notes.push(`+${souls(JACKPOT_SOULS)}`);
    log(s, `${p.name} срывает ДЖЕКПОТ: +${souls(JACKPOT_SOULS)}`, 'epic');
  } else {
    result.notes.push('Пустота смотрит на тебя в ответ.');
    log(s, `${p.name} крутит Колесо: пустота`, 'info');
  }
  if (p.doom >= PITY_AFTER) result.notes.push('Боги сжалились: следующее вращение без проклятий.');
  return result;
}

const PACT_RARITY: Record<ChaosLevel, Record<Rarity, number>> = {
  calm: { common: 32, rare: 42, epic: 20, legendary: 6 },
  normal: { common: 30, rare: 42, epic: 22, legendary: 6 },
  mayhem: { common: 22, rare: 40, epic: 28, legendary: 10 },
};

export function openPact(s: Session, pid: string) {
  prepare(s);
  pay(s, pid, COST.pact);
  const extra = spendEffect(s, pid, 'pact.extra');
  const n = extra ? 4 : 3;
  const chosen = new Set<string>();
  const choices: string[] = [];
  const params: Record<string, string>[] = [];
  const weights = PACT_RARITY[s.enhancer.chaos];
  for (let i = 0; i < n; i++) {
    const rarity = weightedPick(s, RARITY_ORDER, (r) => weights[r]);
    const def = drawPerk(s, pid, 'blessing', rarity, chosen);
    if (!def) break;
    chosen.add(def.id);
    choices.push(def.id);
    params.push(rollParams(s, def) ?? {});
  }
  s.pact = { playerId: pid, choices, params };
  log(s, `${player(s, pid).name} режет ладонь — Кровавый пакт`, 'epic');
}

export function pactCurseChance(s: Session, pid: string): number {
  if (isLast(s, pid)) return 0;
  return CHAOS[s.enhancer.chaos].pactCurse;
}

export function choosePact(s: Session, index: number): ShrineResult {
  const offer = s.pact;
  if (!offer) throw new Error('No pact open');
  const pid = offer.playerId;
  const def = perkDef(offer.choices[index]);
  const params = Object.keys(offer.params[index] ?? {}).length ? offer.params[index] : undefined;
  const result: ShrineResult = { type: 'pact', gained: [], notes: [] };
  const perk = grantPerk(s, pid, def, params);
  result.gained.push({ playerId: pid, perk });
  log(s, `${player(s, pid).name} принимает дар «${def.name}»`, 'good');
  if (nextRandom(s) < pactCurseChance(s, pid)) {
    const curse = drawPerk(s, pid, 'curse', nextRandom(s) < 0.75 ? 'common' : 'rare');
    if (curse) {
      const cp = grantPerk(s, pid, curse);
      result.gained.push({ playerId: pid, perk: cp });
      result.notes.push('Пакт взял свою цену.');
      log(s, `Цена пакта: «${curse.name}»`, 'bad');
    }
  } else {
    result.notes.push('Пакт скреплён без крови.');
  }
  s.pact = undefined;
  return result;
}

const HEX_RARITY: Record<ChaosLevel, Record<Rarity, number>> = {
  calm: { common: 75, rare: 22, epic: 3, legendary: 0 },
  normal: { common: 60, rare: 32, epic: 8, legendary: 0 },
  mayhem: { common: 50, rare: 35, epic: 15, legendary: 0 },
};

export function castHex(s: Session, casterId: string, targetId: string): ShrineResult {
  prepare(s);
  const block = hexBlockReason(s, casterId, targetId);
  if (block) throw new Error(block);
  pay(s, casterId, hexCost(s, casterId, targetId));
  const caster = player(s, casterId);
  const target = player(s, targetId);
  caster.stats.hexesCast += 1;
  const result: ShrineResult = { type: 'hex', gained: [], notes: [] };
  const rarity = weightedPick(s, RARITY_ORDER, (r) => HEX_RARITY[s.enhancer.chaos][r]);

  if (spendEffect(s, targetId, 'hex.mirror')) {
    const def = drawPerk(s, casterId, 'curse', rarity);
    result.reflected = true;
    result.notes.push(`${target.name} держит Чёрное зеркало — сглаз вернулся к ${caster.name}!`);
    log(s, `Зеркало ${target.name} отражает сглаз в ${caster.name}`, 'epic');
    if (def) result.gained.push({ playerId: casterId, perk: grantPerk(s, casterId, def, undefined, targetId) });
    return result;
  }
  if (spendEffect(s, targetId, 'hex.ward')) {
    result.warded = true;
    result.notes.push(`Оберег ${target.name} рассеял сглаз.`);
    log(s, `Оберег ${target.name} рассеивает сглаз ${caster.name}`, 'info');
    return result;
  }
  const def = drawPerk(s, targetId, 'curse', rarity);
  target.stats.hexesTaken += 1;
  if (def) {
    result.gained.push({ playerId: targetId, perk: grantPerk(s, targetId, def, undefined, casterId) });
    log(s, `${caster.name} сглазил ${target.name}: «${def.name}»`, 'bad');
  }
  return result;
}

export function cleanse(s: Session, pid: string, uid: string): ShrineResult {
  prepare(s);
  const p = player(s, pid);
  const perk = p.perks.find((k) => k.uid === uid && k.kind === 'curse');
  if (!perk) throw new Error('No such curse');
  pay(s, pid, COST.cleanse);
  p.perks.splice(p.perks.indexOf(perk), 1);
  const def = perkDef(perk.defId);
  log(s, `${p.name} очищается от «${def.name}»`, 'good');
  return { type: 'cleanse', gained: [], notes: [`«${def.name}» сгорает в святом огне.`] };
}

export const perkText = (perk: ActivePerk) => fillText(perkDef(perk.defId), perk.params);
