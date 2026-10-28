import type { GameId, PerkDef, Rarity, TickUnit } from '../types';
import { GENERIC_PERKS } from './generic';
import { DARTS_PERKS } from '../../games/darts/perks';
import { CHESS_PERKS } from '../../games/chess/perks';
import { DURAK_PERKS } from '../../games/durak/perks';
import { PINGPONG_PERKS } from '../../games/pingpong/perks';
import { UNIVERSAL_PERKS } from '../../games/universal/perks';

export const ALL_PERKS: PerkDef[] = [
  ...GENERIC_PERKS,
  ...DARTS_PERKS,
  ...CHESS_PERKS,
  ...DURAK_PERKS,
  ...PINGPONG_PERKS,
  ...UNIVERSAL_PERKS,
];

const BY_ID = new Map(ALL_PERKS.map((p) => [p.id, p]));

export function perkDef(id: string): PerkDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown perk ${id}`);
  return def;
}

export function perksForGame(game: GameId): PerkDef[] {
  return ALL_PERKS.filter((p) => p.game === game || p.game === 'any');
}

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const RARITY_LABEL: Record<'blessing' | 'curse', Record<Rarity, string>> = {
  blessing: { common: 'Искра', rare: 'Знамение', epic: 'Чудо', legendary: 'Божество' },
  curse: { common: 'Порча', rare: 'Проклятие', epic: 'Рок', legendary: 'Апокалипсис' },
};

/** Native tick unit per game — generic “turn” perks follow it. */
export const GAME_TICK_UNIT: Record<GameId, TickUnit> = {
  darts: 'turn',
  chess: 'turn',
  durak: 'round',
  pingpong: 'rally',
  universal: 'turn',
};

export const resolveUnit = (unit: TickUnit, game: GameId): TickUnit =>
  unit === 'turn' ? GAME_TICK_UNIT[game] : unit;

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const pluralize = (n: number, forms: [string, string, string]) => `${n} ${plural(n, ...forms)}`;

const UNIT_FORMS: Record<TickUnit, [string, string, string]> = {
  turn: ['ход', 'хода', 'ходов'],
  round: ['раунд', 'раунда', 'раундов'],
  rally: ['розыгрыш', 'розыгрыша', 'розыгрышей'],
};

export function durationLabel(def: PerkDef, game: GameId, left?: number): string {
  const d = def.duration;
  switch (d.type) {
    case 'instant':
      return 'Мгновенно';
    case 'game':
      return 'До конца игры';
    case 'charges':
      return pluralize(left ?? d.n, ['заряд', 'заряда', 'зарядов']);
    case 'ticks':
      return pluralize(left ?? d.n, UNIT_FORMS[resolveUnit(d.unit, game)]);
  }
}

export function fillText(def: PerkDef, params?: Record<string, string>): string {
  if (!params) return def.text.replace(/\{(\w+)\}/g, '?');
  return def.text.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '?');
}

export { plural };
