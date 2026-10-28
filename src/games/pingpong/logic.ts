import type { Session } from '../../core/types';
import type { GameLogic } from '../types';
import { awardSouls, effects, finish, log, player, spendEffect, tickPerks } from '../../core/session';
import type { PingPongGame } from './state';

export const pong = (s: Session) => s.game as PingPongGame;

export const opponent = (g: PingPongGame, id: string) => (g.ids[0] === id ? g.ids[1] : g.ids[0]);

/** Points the player still needs to take the current game. */
export function pointsToGame(g: PingPongGame, id: string): number {
  const mine = g.points[id];
  const theirs = g.points[opponent(g, id)];
  const target = Math.max(g.pointsToWin, theirs + 2);
  return Math.max(0, target - mine);
}

export function server(g: PingPongGame): string {
  const total = g.points[g.ids[0]] + g.points[g.ids[1]];
  const deuce = g.points[g.ids[0]] >= g.pointsToWin - 1 && g.points[g.ids[1]] >= g.pointsToWin - 1;
  const idx = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return idx === 0 ? g.firstServer : opponent(g, g.firstServer);
}

export const gamesToWin = (g: PingPongGame) => Math.ceil(g.bestOf / 2);

export function scorePoint(s: Session, winnerId: string) {
  if (s.status !== 'playing') return;
  const g = pong(s);
  const loserId = opponent(g, winnerId);
  const l = player(s, loserId);

  let value = 1;
  let note: string | undefined;
  if (effects(l, 'pp.pointShield').length) {
    spendEffect(s, loserId, 'pp.pointShield');
    value = 0;
    note = `${l.name} выставляет Стену — очко не засчитано`;
  } else {
    const mult = spendEffect(s, winnerId, 'pp.pointMult');
    if (mult) {
      value = Math.min(mult.effect?.value ?? 2, pointsToGame(g, winnerId));
      note = `${mult.name}: +${value}`;
    }
  }
  g.points[winnerId] += value;
  g.lastPoint = { winnerId, value, note };
  if (note) log(s, note, value === 0 ? 'info' : 'good');

  if (value > 0) {
    if (g.streak.id === winnerId) g.streak.n += 1;
    else g.streak = { id: winnerId, n: 1 };
    if (g.streak.n % 3 === 0) awardSouls(s, winnerId, 1, `серия из ${g.streak.n}`);
    const gap = g.points[winnerId] - g.points[loserId];
    if (gap >= 4 && !g.comebackPaid[loserId]) {
      g.comebackPaid[loserId] = true;
      awardSouls(s, loserId, 1, 'второе дыхание');
    }
  }

  tickPerks(s, g.ids, 'rally');
  s.turnNo += 1;
  g.rallies += 1;

  if (g.points[winnerId] >= g.pointsToWin && g.points[winnerId] - g.points[loserId] >= 2) {
    winGame(s, winnerId);
  }
}

function winGame(s: Session, winnerId: string) {
  const g = pong(s);
  const loserId = opponent(g, winnerId);
  g.games[winnerId] += 1;
  g.history.push({ winnerId, score: { ...g.points } });
  log(
    s,
    `${player(s, winnerId).name} берёт партию ${g.points[winnerId]}:${g.points[loserId]}`,
    'epic',
  );
  awardSouls(s, winnerId, 3, 'победа в партии');
  awardSouls(s, loserId, 1, 'горечь поражения');
  if (g.games[winnerId] >= gamesToWin(g)) {
    g.matchWinner = winnerId;
    finish(s, [winnerId, loserId]);
    return;
  }
  g.points = { [g.ids[0]]: 0, [g.ids[1]]: 0 };
  g.firstServer = opponent(g, g.firstServer);
  g.rallies = 0;
  g.streak = { id: null, n: 0 };
  g.comebackPaid = { [g.ids[0]]: false, [g.ids[1]]: false };
  g.lastPoint = undefined;
}

export const pingpongLogic: GameLogic = {
  id: 'pingpong',
  createGame(players, opts) {
    const ids: [string, string] = [players[0].id, players[1].id];
    const game: PingPongGame = {
      ids,
      pointsToWin: Number(opts.points ?? 11),
      bestOf: Number(opts.bestOf ?? 3),
      points: { [ids[0]]: 0, [ids[1]]: 0 },
      games: { [ids[0]]: 0, [ids[1]]: 0 },
      firstServer: ids[0],
      rallies: 0,
      streak: { id: null, n: 0 },
      comebackPaid: { [ids[0]]: false, [ids[1]]: false },
      history: [],
    };
    return game;
  },
  currentPlayerId: (s) => (s.status === 'playing' ? server(pong(s)) : null),
  standings(s) {
    const g = pong(s);
    if (g.matchWinner) return [g.matchWinner, opponent(g, g.matchWinner)];
    return g.ids
      .slice()
      .sort((a, b) => g.games[b] - g.games[a] || g.points[b] - g.points[a] || g.ids.indexOf(a) - g.ids.indexOf(b));
  },
  scoreView(s, pid) {
    const g = pong(s);
    return { main: String(g.points[pid]), sub: `партии: ${g.games[pid]}` };
  },
  shrineAccess(s) {
    if (s.status !== 'playing') return 'Матч окончен';
    return null;
  },
  applyInstant(s, pid, def) {
    if (def.effect?.tag !== 'pp.oppPoint') return;
    const g = pong(s);
    const foe = opponent(g, pid);
    const room = pointsToGame(g, foe) - 1;
    const add = Math.max(0, Math.min(def.effect.value ?? 1, room));
    g.points[foe] += add;
    return add ? `${player(s, foe).name} получает +${add} очко` : 'Штраф не может решить партию — сгорает';
  },
  status(s) {
    const g = pong(s);
    const n = g.history.length + 1;
    return `Партия ${n} · до ${g.pointsToWin} · матч до ${gamesToWin(g)} побед`;
  },
};
