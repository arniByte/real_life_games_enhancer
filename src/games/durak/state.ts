export interface DurakRound {
  no: number;
  /** Players in the order they went out (best first). */
  out: string[];
  /** The fool of the round; null on a draw. */
  foolId: string | null;
  /** Fool count that was actually applied (0 shielded, 2 doubled). */
  foolWeight: number;
}

export interface DurakGame {
  order: string[];
  /** End condition: the game ends when someone becomes fool this many times. */
  foolLimit: number;
  round: number;
  /** Players already out in the current round. */
  out: string[];
  fools: Record<string, number>;
  history: DurakRound[];
  variant: 'podkidnoy' | 'perevodnoy';
}
