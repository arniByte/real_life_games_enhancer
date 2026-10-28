export type Side = 'w' | 'b';
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q';

export const PIECE_VALUE: Record<PieceKind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export const PIECE_NAME: Record<PieceKind, string> = {
  p: 'пешку',
  n: 'коня',
  b: 'слона',
  r: 'ладью',
  q: 'ферзя',
};
export const PIECE_GLYPH: Record<PieceKind, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

export interface ChessClock {
  enabled: boolean;
  baseMs: number;
  incMs: number;
  remaining: Record<Side, number>;
  running: boolean;
  /** performance-independent wall clock (Date.now()) when the current side's time started. */
  startedAt: number | null;
}

export interface ChessGame {
  sides: Record<Side, string>;
  toMove: Side;
  moveNo: number;
  clock: ChessClock;
  captured: Record<Side, PieceKind[]>;
  /** Events registered during the current move (reset on clock hit). */
  pending: string[];
  checkGiven: boolean;
  result?: { winner: Side | 'draw'; reason: string };
}

export const otherSide = (s: Side): Side => (s === 'w' ? 'b' : 'w');
export const sideName = (s: Side) => (s === 'w' ? 'Белые' : 'Чёрные');
