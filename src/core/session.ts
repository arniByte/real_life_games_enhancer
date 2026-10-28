// Low-level helpers that mutate an (immer draft) Session. Game logic builds on these.

import type { ActivePerk, LogTone, PerkDef, Session, SessionPlayer, TickUnit } from './types';
import { perkDef, resolveUnit } from './perks/registry';

export const MAX_BLESSINGS = 4;
export const MAX_CURSES = 3;
const LOG_LIMIT = 80;

export function player(s: Session, id: string): SessionPlayer {
  const p = s.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export function log(s: Session, text: string, tone: LogTone = 'info') {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, text, tone, at: Date.now() });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

export function nextUid(s: Session): string {
  s.uidSeq += 1;
  return `k${s.uidSeq}`;
}

/** Active perks of a player carrying a given effect tag. */
export function effects(p: SessionPlayer, tag: string): { perk: ActivePerk; def: PerkDef }[] {
  const out: { perk: ActivePerk; def: PerkDef }[] = [];
  for (const perk of p.perks) {
    const def = perkDef(perk.defId);
    if (def.effect?.tag === tag) out.push({ perk, def });
  }
  return out;
}

export const hasEffect = (p: SessionPlayer, tag: string) => effects(p, tag).length > 0;

export function removePerk(p: SessionPlayer, uid: string) {
  const i = p.perks.findIndex((k) => k.uid === uid);
  if (i >= 0) p.perks.splice(i, 1);
}

/** Spend one charge of a perk; drops it at zero. Returns true if it was spent. */
export function spendCharge(s: Session, playerId: string, uid: string, quiet = false): boolean {
  const p = player(s, playerId);
  const perk = p.perks.find((k) => k.uid === uid);
  if (!perk) return false;
  const def = perkDef(perk.defId);
  if (def.duration.type === 'charges') {
    perk.left = (perk.left ?? def.duration.n) - 1;
    if (perk.left <= 0) {
      removePerk(p, uid);
      if (!quiet) log(s, `${p.name}: «${def.name}» исчерпан`, 'system');
    }
  } else {
    removePerk(p, uid);
  }
  return true;
}

/** Spend the first perk with the tag. Returns its def if found. */
export function spendEffect(s: Session, playerId: string, tag: string): PerkDef | null {
  const found = effects(player(s, playerId), tag)[0];
  if (!found) return null;
  spendCharge(s, playerId, found.perk.uid, true);
  return found.def;
}

/** Count down timed perks. `unit` is the game's native unit for this event. */
export function tickPerks(s: Session, playerIds: string[], unit: TickUnit) {
  for (const id of playerIds) {
    const p = player(s, id);
    for (const perk of p.perks.slice()) {
      const def = perkDef(perk.defId);
      if (def.duration.type !== 'ticks') continue;
      if (resolveUnit(def.duration.unit, s.gameId) !== unit) continue;
      perk.left = (perk.left ?? def.duration.n) - 1;
      if (perk.left <= 0) {
        removePerk(p, perk.uid);
        log(s, `${p.name}: «${def.name}» угасает`, 'system');
      }
    }
  }
}

/** Grant souls, applying income bonuses and taxes. Returns the amount actually gained. */
export function awardSouls(s: Session, playerId: string, amount: number, reason: string): number {
  if (!s.enhancer.enabled || amount <= 0) return 0;
  const p = player(s, playerId);
  let total = amount;
  const notes: string[] = [];
  const bonus = spendEffect(s, playerId, 'income.bonus');
  if (bonus) {
    total += bonus.effect?.value ?? 1;
    notes.push(bonus.name);
  }
  const tax = spendEffect(s, playerId, 'income.tax');
  if (tax) {
    total -= tax.effect?.value ?? 1;
    notes.push(tax.name);
  }
  total = Math.max(0, total);
  p.souls += total;
  p.stats.soulsEarned += total;
  const suffix = notes.length ? ` (${notes.join(', ')})` : '';
  log(s, `${p.name} +${total} ${soulWord(total)} — ${reason}${suffix}`, 'souls');
  return total;
}

export function takeSouls(s: Session, playerId: string, amount: number): number {
  const p = player(s, playerId);
  const taken = Math.min(p.souls, Math.max(0, amount));
  p.souls -= taken;
  return taken;
}

export function soulWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'душа';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'души';
  return 'душ';
}

export const souls = (n: number) => `${n} ${soulWord(n)}`;

export function finish(s: Session, standings: string[]) {
  s.status = 'finished';
  s.standings = standings;
  s.pact = undefined;
}
