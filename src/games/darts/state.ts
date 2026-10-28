export interface Dart {
  /** 0 = miss, 1..20, 25 = bull. */
  n: number;
  /** 1 single, 2 double, 3 triple. Bull: 1 = outer (25), 2 = bullseye (50). */
  m: 1 | 2 | 3;
}

export interface DartsTurnRecord {
  playerId: string;
  round: number;
  darts: Dart[];
  /** Points actually applied after perks. */
  scored: number;
  bust: boolean;
  finished: boolean;
  notes: string[];
}

export interface DartsGame {
  mode: 'x01' | 'rounds';
  start: number;
  doubleOut: boolean;
  maxRounds: number;
  order: string[];
  current: number;
  round: number;
  /** x01: points remaining. rounds: points collected. */
  scores: Record<string, number>;
  turn: Dart[];
  history: DartsTurnRecord[];
  winnerId?: string;
}

export const dartFace = (d: Dart): number => (d.n === 25 ? 25 * d.m : d.n * d.m);

export const dartLabel = (d: Dart): string => {
  if (d.n === 0) return 'Мимо';
  if (d.n === 25) return d.m === 2 ? 'Яблочко' : 'Бык 25';
  return `${d.m === 3 ? 'T' : d.m === 2 ? 'D' : ''}${d.n}`;
};
