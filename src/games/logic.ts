import type { GameId } from '../core/types';
import type { GameLogic } from './types';
import { dartsLogic } from './darts/logic';
import { chessLogic } from './chess/logic';
import { durakLogic } from './durak/logic';
import { pingpongLogic } from './pingpong/logic';
import { universalLogic } from './universal/logic';

export const GAME_LOGIC: Record<GameId, GameLogic> = {
  darts: dartsLogic,
  chess: chessLogic,
  durak: durakLogic,
  pingpong: pingpongLogic,
  universal: universalLogic,
};
