import { RetroEngine } from './engine';
import type { FxEvent, SceneId } from './fx';
import type { BaseScene } from './scenes/base';
import { HubScene } from './scenes/hub';
import { CastleScene } from './scenes/castle';
import { TavernScene } from './scenes/tavern';
import { DenScene } from './scenes/den';
import { ArenaScene } from './scenes/arena';
import { VoidScene } from './scenes/void';
import { ShrineScene } from './scenes/shrine';

export type { FxEvent, SceneId };

const FACTORIES: Record<SceneId, () => BaseScene> = {
  hub: () => new HubScene(),
  chess: () => new CastleScene(),
  darts: () => new TavernScene(),
  durak: () => new DenScene(),
  pingpong: () => new ArenaScene(),
  universal: () => new VoidScene(),
  shrine: () => new ShrineScene(),
};

let engine: RetroEngine | null = null;

export function mountEngine(canvas: HTMLCanvasElement): RetroEngine {
  engine?.dispose();
  engine = new RetroEngine(canvas, (id) => FACTORIES[id]());
  return engine;
}

export const getEngine = () => engine;

/** Fire a visual effect in the current world (no-op before the engine mounts). */
export const fx = (e: FxEvent) => engine?.fx(e);

export const goScene = (id: SceneId) => engine?.go(id);
