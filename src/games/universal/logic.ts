import type { Session } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, spendEffect, tickPerks } from '../../core/session';
import type { UniversalGame } from './state';

export const uni = (s: Session) => s.game as UniversalGame;

/** Change a player's points, applying multipliers and shields. Returns the applied delta. */
export function addPoints(s: Session, pid: string, delta: number): number {
  if (s.status !== 'playing' || delta === 0) return 0;
  const g = uni(s);
  const p = player(s, pid);
  let applied = delta;
  if (delta > 0) {
    const mult = spendEffect(s, pid, 'uni.gainMult');
    if (mult) {
      applied = Math.floor(delta * (mult.effect?.value ?? 1));
      log(s, `${p.name}: «${mult.name}» — ${delta} → ${applied}`, (mult.effect?.value ?? 1) > 1 ? 'good' : 'bad');
    }
  } else if (effects(p, 'uni.lossShield').length) {
    spendEffect(s, pid, 'uni.lossShield');
    log(s, `${p.name}: Щит отражает потерю ${-delta}`, 'good');
    return 0;
  }
  g.scores[pid] += applied;
  g.roundGain[pid] += applied;
  checkTarget(s, pid);
  return applied;
}

function checkTarget(s: Session, pid: string) {
  const g = uni(s);
  if (!g.target || s.status !== 'playing') return;
  if (g.scores[pid] >= g.target) {
    if (g.lowWins) log(s, `${player(s, pid).name} достигает ${g.target} и выбывает. Игра окончена.`, 'epic');
    else {
      g.winnerId = pid;
      log(s, `${player(s, pid).name} достигает ${g.target}! Победа.`, 'epic');
    }
    finish(s, universalLogic.standings(s));
  }
}

export function nextTurn(s: Session) {
  if (s.status !== 'playing') return;
  const g = uni(s);
  const pid = g.order[g.current];
  tickPerks(s, [pid], 'turn');
  s.turnNo += 1;
  g.current += 1;
  if (g.current >= g.order.length) {
    g.current = 0;
    endRound(s);
  }
}

export function endRound(s: Session) {
  const g = uni(s);
  const best = Math.max(...g.order.map((id) => g.roundGain[id]));
  if (best > 0) {
    for (const id of g.order) if (g.roundGain[id] === best) awardSouls(s, id, 1, 'лучший раунд');
  }
  const st = universalLogic.standings(s);
  const last = st[st.length - 1];
  if (st.length >= 2 && g.scores[last] !== g.scores[st[0]]) awardSouls(s, last, 1, 'фора отстающему');
  if (g.maxRounds && g.round >= g.maxRounds) {
    log(s, 'Последний раунд сыгран.', 'epic');
    finish(s, st);
    return;
  }
  g.round += 1;
  g.current = 0;
  g.roundGain = Object.fromEntries(g.order.map((id) => [id, 0]));
  log(s, `— Раунд ${g.round} —`, 'system');
}

export function endUniversal(s: Session) {
  if (s.status !== 'playing') return;
  log(s, 'Игра завершена хозяином стола.', 'epic');
  finish(s, universalLogic.standings(s));
}

export const universalLogic: GameLogic = {
  id: 'universal',
  createGame(players, opts) {
    const game: UniversalGame = {
      title: String(opts.title || 'Любая игра'),
      order: players.map((p) => p.id),
      current: 0,
      round: 1,
      step: Number(opts.step ?? 1),
      target: Number(opts.target ?? 0),
      maxRounds: Number(opts.rounds ?? 0),
      lowWins: Boolean(opts.lowWins ?? false),
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      roundGain: Object.fromEntries(players.map((p) => [p.id, 0])),
    };
    return game;
  },
  currentPlayerId: (s) => (s.status === 'playing' ? uni(s).order[uni(s).current] : null),
  standings(s) {
    const g = uni(s);
    const dir = g.lowWins ? 1 : -1;
    return g.order.slice().sort((a, b) => dir * (g.scores[a] - g.scores[b]) || g.order.indexOf(a) - g.order.indexOf(b));
  },
  scoreView(s, pid) {
    const g = uni(s);
    return { main: String(g.scores[pid]), sub: g.roundGain[pid] ? `раунд: ${g.roundGain[pid] > 0 ? '+' : ''}${g.roundGain[pid]}` : 'очков' };
  },
  shrineAccess(s) {
    return s.status === 'playing' ? null : 'Игра окончена';
  },
  applyInstant(s, pid, def) {
    const g = uni(s);
    const v = (def.effect?.value ?? 1) * g.step;
    const me = player(s, pid);
    switch (def.effect?.tag) {
      case 'uni.bonus': {
        const got = addPoints(s, pid, v);
        return `${me.name} получает +${got} очков`;
      }
      case 'uni.lose': {
        const lost = addPoints(s, pid, -v);
        return lost ? `${me.name} теряет ${-lost} очков` : undefined;
      }
      case 'uni.steal': {
        const target = universalLogic.standings(s).filter((id) => id !== pid)[0];
        if (!target) return;
        const take = g.lowWins ? v : Math.min(v, Math.max(0, g.scores[target]));
        if (g.lowWins) {
          g.scores[pid] -= take;
          g.scores[target] += take;
        } else {
          g.scores[target] -= take;
          g.scores[pid] += take;
        }
        checkTarget(s, pid);
        return `${me.name} грабит ${player(s, target).name}: ${take} очков`;
      }
    }
  },
  status(s) {
    const g = uni(s);
    const parts = [g.title, `Раунд ${g.round}${g.maxRounds ? ` / ${g.maxRounds}` : ''}`];
    if (g.target) parts.push(`${g.lowWins ? 'выбывание на' : 'до'} ${g.target}`);
    return parts.join(' · ');
  },
};
