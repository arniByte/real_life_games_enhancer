import type { Session } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, spendEffect, tickPerks } from '../../core/session';
import type { DurakGame } from './state';

export const durak = (s: Session) => s.game as DurakGame;

/** Mark a player as having gone out (emptied their hand) this round. */
export function playerOut(s: Session, pid: string) {
  const g = durak(s);
  if (s.status !== 'playing' || g.out.includes(pid)) return;
  g.out.push(pid);
  const remaining = g.order.filter((id) => !g.out.includes(id));
  if (remaining.length === 1) endRound(s, remaining[0]);
}

/** Undo a mark within the current round. */
export function unmarkOut(s: Session, pid: string) {
  const g = durak(s);
  g.out = g.out.filter((id) => id !== pid);
}

/** Last two players went out simultaneously. */
export function drawRound(s: Session) {
  const g = durak(s);
  const remaining = g.order.filter((id) => !g.out.includes(id));
  g.out.push(...remaining);
  endRound(s, null);
}

function endRound(s: Session, foolId: string | null) {
  const g = durak(s);
  const out = foolId ? [...g.out, foolId] : g.out.slice();
  let weight = 0;
  if (foolId) {
    const fool = player(s, foolId);
    weight = 1;
    if (effects(fool, 'durak.foolDouble').length) weight = 2;
    const mask = spendEffect(s, foolId, 'durak.foolShield');
    if (mask) {
      weight = 0;
      log(s, `${fool.name} надевает Маску шута — позор не засчитан!`, 'good');
    }
    g.fools[foolId] += weight;
    log(
      s,
      weight === 0
        ? `Раунд ${g.round}: ${fool.name} остался с картами… но маска спасла`
        : `Раунд ${g.round}: ${fool.name} — ДУРАК${weight === 2 ? ' (двойной позор!)' : ''}`,
      'bad',
    );
  } else {
    log(s, `Раунд ${g.round}: ничья — никто не дурак`, 'info');
  }
  g.history.push({ no: g.round, out, foolId, foolWeight: weight });

  // Souls: the first out is rewarded, the second (in 4+ games) too, the fool is consoled.
  awardSouls(s, out[0], 2, 'вышел первым');
  if (g.order.length >= 4 && out[1] && out[1] !== foolId) awardSouls(s, out[1], 1, 'вышел вторым');
  if (foolId) awardSouls(s, foolId, 1, 'утешение дурака');

  tickPerks(s, g.order, 'round');
  s.turnNo += 1;

  const loser = g.order.find((id) => g.fools[id] >= g.foolLimit);
  if (loser) {
    log(s, `${player(s, loser).name} становится Великим Дураком. Игра окончена.`, 'epic');
    finish(s, durakLogic.standings(s));
    return;
  }
  g.round += 1;
  g.out = [];
}

export const durakLogic: GameLogic = {
  id: 'durak',
  createGame(players, opts) {
    const game: DurakGame = {
      order: players.map((p) => p.id),
      foolLimit: Number(opts.foolLimit ?? 3),
      round: 1,
      out: [],
      fools: Object.fromEntries(players.map((p) => [p.id, 0])),
      history: [],
      variant: (opts.variant as DurakGame['variant']) ?? 'podkidnoy',
    };
    return game;
  },
  currentPlayerId: () => null,
  standings(s) {
    const g = durak(s);
    const firstOuts = (id: string) => g.history.filter((r) => r.out[0] === id).length;
    return g.order
      .slice()
      .sort((a, b) => g.fools[a] - g.fools[b] || firstOuts(b) - firstOuts(a) || g.order.indexOf(a) - g.order.indexOf(b));
  },
  scoreView(s, pid) {
    const g = durak(s);
    const n = g.fools[pid];
    const pos = g.out.indexOf(pid);
    return { main: `${n}/${g.foolLimit}`, sub: pos >= 0 ? `вышел ${pos + 1}-м` : 'дурак' };
  },
  shrineAccess(s) {
    if (s.status !== 'playing') return 'Игра окончена';
    if (durak(s).out.length > 0) return 'Раунд идёт — алтарь откроется после него';
    return null;
  },
  status(s) {
    const g = durak(s);
    return `${g.variant === 'perevodnoy' ? 'Переводной' : 'Подкидной'} · Раунд ${g.round} · до ${g.foolLimit} поражений`;
  },
};
