export interface PingPongGameRecord {
  winnerId: string;
  score: Record<string, number>;
}

export interface PingPongGame {
  /** Exactly two players, [left, right]. */
  ids: [string, string];
  pointsToWin: number;
  bestOf: number;
  points: Record<string, number>;
  games: Record<string, number>;
  /** Who served first in the current game. */
  firstServer: string;
  /** Rallies played in the current game (drives the serve rotation). */
  rallies: number;
  /** Consecutive points of the player who won the last rally. */
  streak: { id: string | null; n: number };
  comebackPaid: Record<string, boolean>;
  history: PingPongGameRecord[];
  lastPoint?: { winnerId: string; value: number; note?: string };
  matchWinner?: string;
}
