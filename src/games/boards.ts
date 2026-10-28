import type { ComponentType } from 'react';
import type { GameId, Session } from '../core/types';
import { DartsBoard } from './darts/Board';
import { ChessBoard } from './chess/Board';
import { DurakBoard } from './durak/Board';
import { PingPongBoard } from './pingpong/Board';
import { UniversalBoard } from './universal/Board';

export const BOARDS: Record<GameId, ComponentType<{ session: Session }>> = {
  darts: DartsBoard,
  chess: ChessBoard,
  durak: DurakBoard,
  pingpong: PingPongBoard,
  universal: UniversalBoard,
};
