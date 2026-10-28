import type { WheelSector } from './textures';

export type SceneId = 'hub' | 'darts' | 'chess' | 'durak' | 'pingpong' | 'universal' | 'shrine';

export type FxEvent =
  | { type: 'flash'; color?: string; strength?: number }
  | { type: 'shake'; amount?: number }
  | { type: 'souls'; amount: number }
  | { type: 'win'; color?: string }
  | { type: 'hub.select'; index: number }
  | { type: 'hub.mode'; mode: 'title' | 'hub' | 'enter' }
  | { type: 'darts.hit'; n: number; m: number }
  | { type: 'darts.clear' }
  | { type: 'darts.bust' }
  | { type: 'darts.big'; score: number }
  | { type: 'chess.capture'; piece: string }
  | { type: 'chess.check' }
  | { type: 'chess.move'; side: 'w' | 'b' }
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
