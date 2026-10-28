import { produce } from 'immer';
import type { EnhancerSettings, GameId, Session, SessionPlayer } from '../core/types';
import { GAME_LOGIC } from '../games/logic';

export function makePlayers(n: number): SessionPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: '#fff',
    sigil: 'skull' as const,
    souls: 0,
    perks: [],
    doom: 0,
    stats: { soulsEarned: 0, soulsSpent: 0, spins: 0, blessings: 0, curses: 0, hexesCast: 0, hexesTaken: 0 },
  }));
}

export function makeSession(gameId: GameId, n: number, opts: Record<string, unknown> = {}, enhancer?: Partial<EnhancerSettings>): Session {
  const players = makePlayers(n);
  return {
    id: 't',
    gameId,
    createdAt: 0,
    enhancer: { enabled: true, chaos: 'normal', startSouls: 0, ...enhancer },
    players,
    game: GAME_LOGIC[gameId].createGame(players, opts),
    log: [],
    logSeq: 0,
    status: 'playing',
    rng: 12345,
    turnNo: 0,
    uidSeq: 0,
  };
}

export const run = <T,>(s: Session, fn: (d: Session) => T): Session => produce(s, (d) => void fn(d as Session));
