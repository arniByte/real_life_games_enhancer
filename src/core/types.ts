// Core domain types shared by every game module.

export type GameId = 'darts' | 'chess' | 'durak' | 'pingpong' | 'universal';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type PerkKind = 'blessing' | 'curse';

/** What makes a timed perk count down. */
export type TickUnit = 'turn' | 'round' | 'rally';

export type PerkDuration =
  | { type: 'instant' } // resolves on acquire, never sits in a slot
  | { type: 'charges'; n: number } // spent by the app (effect) or manually (“Использовать”)
  | { type: 'ticks'; n: number; unit: TickUnit } // lasts N of the player's turns / rounds / rallies
  | { type: 'game' }; // stays until the end of the game

/** App-integrated effect. Games read these tags; perks without one are pure table rules. */
export interface PerkEffect {
  tag: string;
  value?: number;
}

export interface PerkDef {
  id: string;
  game: GameId | 'any';
  kind: PerkKind;
  rarity: Rarity;
  name: string;
  /** Rule text. `{param}` placeholders are filled from rolled params. */
  text: string;
  icon: IconId;
  duration: PerkDuration;
  effect?: PerkEffect;
  /** Random params rolled on acquire (e.g. a cursed number or a frozen file). */
  params?: Record<string, readonly string[]>;
  /** Relative draw weight inside its rarity bucket. Default 1. */
  weight?: number;
  /** Only offered when the predicate holds (e.g. X01-only perks). */
  requires?: (ctx: PerkContext) => boolean;
}

export interface PerkContext {
  session: Session;
  playerId: string;
}

export interface ActivePerk {
  uid: string;
  defId: string;
  kind: PerkKind;
  /** Remaining charges or ticks (undefined for whole-game perks). */
  left?: number;
  params?: Record<string, string>;
  /** Who cast it (for hexes). */
  fromId?: string;
  /** Turn counter value when acquired — ticks skip the turn it was bought in when needed. */
  bornAt: number;
}

export type IconId =
  | 'skull' | 'crown' | 'eye' | 'moon' | 'sun' | 'flame' | 'dagger' | 'rose' | 'spider' | 'key'
  | 'star' | 'bat' | 'heart' | 'shield' | 'hourglass' | 'coin' | 'bolt' | 'hand' | 'mask' | 'chain'
  | 'dart' | 'target' | 'pawn' | 'knight' | 'rook' | 'queen' | 'card' | 'paddle' | 'ball' | 'dice'
  | 'mirror' | 'feather' | 'potion' | 'ghost' | 'lock' | 'wing' | 'snow' | 'mouth' | 'boot' | 'void'
  | 'swirl' | 'scroll';

export interface RosterPlayer {
  id: string;
  name: string;
  color: string;
  sigil: IconId;
}

export interface PlayerStats {
  soulsEarned: number;
  soulsSpent: number;
  spins: number;
  blessings: number;
  curses: number;
  hexesCast: number;
  hexesTaken: number;
}

export interface SessionPlayer extends RosterPlayer {
  souls: number;
  perks: ActivePerk[];
  stats: PlayerStats;
  /** Consecutive curses from the wheel (pity counter). */
  doom: number;
}

export type ChaosLevel = 'calm' | 'normal' | 'mayhem';

export interface EnhancerSettings {
  enabled: boolean;
  chaos: ChaosLevel;
  startSouls: number;
}

export type LogTone = 'info' | 'good' | 'bad' | 'souls' | 'epic' | 'system';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
  at: number;
}

export interface PactOffer {
  playerId: string;
  choices: string[]; // perk def ids
  params: Record<string, string>[];
}

export interface Session {
  id: string;
  gameId: GameId;
  createdAt: number;
  enhancer: EnhancerSettings;
  players: SessionPlayer[];
  /** Game-specific state, owned by the game module. */
  game: unknown;
  log: LogEntry[];
  logSeq: number;
  status: 'playing' | 'finished';
  /** Ordered best → worst once finished. */
  standings?: string[];
  rng: number;
  /** Monotonic counter of turns taken in the session (all players). */
  turnNo: number;
  pact?: PactOffer;
  uidSeq: number;
}

/** Outcome sectors of the Wheel of Fortune. */
export type WheelOutcome =
  | 'bless_common' | 'bless_rare' | 'bless_epic' | 'bless_legendary'
  | 'curse_common' | 'curse_rare' | 'curse_epic'
  | 'void' | 'jackpot';

export interface ShrineResult {
  type: 'wheel' | 'pact' | 'hex' | 'cleanse';
  outcome?: WheelOutcome;
  /** Perk(s) granted by this visit. */
  gained: { playerId: string; perk: ActivePerk }[];
  /** Human-readable lines for the reveal screen. */
  notes: string[];
  soulsDelta?: number;
  reflected?: boolean;
  warded?: boolean;
}
