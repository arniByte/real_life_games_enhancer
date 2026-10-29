import type { WheelSector } from './textures';

export type SceneId = 'hub' | 'darts' | 'chess' | 'durak' | 'pingpong' | 'universal' | 'shrine';

/** Events going the other way: from the 3D world to the UI. */
export type SceneEvent =
  | { type: 'scene.ready'; id: SceneId }
  | { type: 'chess.square'; square: string; under?: string }
  | { type: 'chess.hover'; square: string | null }
  | { type: 'darts.board'; n: number; m: 1 | 2 | 3; at: { x: number; y: number } }
  | { type: 'darts.aim'; n: number; m: 1 | 2 | 3 }
  | { type: 'darts.aimOff' };

export interface ChessHighlight {
  selected: string | null;
  targets: { square: string; capture: boolean }[];
  /** Special perk selection mode tints targets differently. */
  perk?: boolean;
}

export interface ChessAnim {
  from: string;
  to: string;
  captured?: string;
  capturedAt?: string;
  castle?: { rookFrom: string; rookTo: string };
  promotion?: string;
  swap?: boolean;
}

export type FxEvent =
  | { type: 'flash'; color?: string; strength?: number }
  | { type: 'shake'; amount?: number }
  | { type: 'souls'; amount: number }
  | { type: 'win'; color?: string }
  | { type: 'hub.select'; index: number }
  | { type: 'hub.mode'; mode: 'title' | 'hub' | 'enter' }
  | { type: 'darts.hit'; n: number; m: number; at?: { x: number; y: number } }
  | { type: 'darts.clear' }
  | { type: 'darts.bust' }
  | { type: 'darts.big'; score: number }
  | { type: 'chess.capture'; piece: string }
  | { type: 'chess.check' }
  | { type: 'chess.move'; side: 'w' | 'b' }
  | { type: 'chess.sync'; fen: string; lastMove?: { from: string; to: string }; check: string | null; anim?: ChessAnim; mirror: boolean; flip?: boolean }
  | { type: 'chess.highlight'; hl: ChessHighlight }
  | { type: 'chess.clock'; w: string; b: string; toMove: 'w' | 'b'; running: boolean; low: boolean }
  | { type: 'chess.view'; side: 'w' | 'b' }
  | { type: 'darts.score'; rows: { name: string; color: string; score: string; active: boolean }[]; turn: string[]; title: string; hint?: string }
  | { type: 'durak.out' }
  | { type: 'durak.fool' }
  | { type: 'pp.point'; side: 0 | 1; color: string }
  | { type: 'uni.points'; delta: number }
  | { type: 'uni.round' }
  | { type: 'wheel.setup'; sectors: WheelSector[] }
  | { type: 'wheel.spin'; to: number; duration: number; onTick?: () => void; onDone?: () => void }
  | { type: 'shrine.reveal'; tone: 'blessing' | 'curse' | 'void' | 'jackpot'; color: string }
  | { type: 'shrine.hex' }
  | { type: 'shrine.cleanse' }
  | { type: 'shrine.pact' };
