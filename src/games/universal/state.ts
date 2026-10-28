export interface UniversalGame {
  title: string;
  order: string[];
  current: number;
  round: number;
  /** Base point step for buttons and perks (1, 5, 10, 100…). */
  step: number;
  /** 0 = no target. */
  target: number;
  /** 0 = unlimited. */
  maxRounds: number;
  lowWins: boolean;
  scores: Record<string, number>;
  /** Points gained in the current round (for the round bonus). */
  roundGain: Record<string, number>;
  winnerId?: string;
}
