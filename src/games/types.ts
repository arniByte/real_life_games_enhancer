import type { ActivePerk, GameId, IconId, PerkDef, Session, SessionPlayer } from '../core/types';

export interface OptionChoice {
  value: string | number | boolean;
  label: string;
}

export interface OptionDef {
  key: string;
  label: string;
  /** Free text input instead of choices. */
  text?: boolean;
  choices: OptionChoice[];
  hint?: string;
  /** Hide the option unless the predicate holds for the current options. */
  visible?: (opts: Record<string, unknown>) => boolean;
}

export interface ScoreView {
  main: string;
  sub?: string;
}

export interface GameRules {
  title: string;
  body: string[];
}

/** Static description of a game: names, setup options, rules for the codex. */
export interface GameMeta {
  id: GameId;
  title: string;
  world: string;
  tagline: string;
  icon: IconId;
  /** CSS accent color of the world. */
  accent: string;
  minPlayers: number;
  maxPlayers: number;
  options: OptionDef[];
  defaultOptions: Record<string, unknown>;
  rules: GameRules[];
  income: string[];
  shrineRule: string;
}

/** Pure rules engine of a game. Never touches React or Three. */
export interface GameLogic {
  id: GameId;
  createGame(players: SessionPlayer[], options: Record<string, unknown>): unknown;
  currentPlayerId(s: Session): string | null;
  /** Ordered best → worst. Used for catch-up odds and the results screen. */
  standings(s: Session): string[];
  scoreView(s: Session, playerId: string): ScoreView;
  /** null = may visit the shrine now, otherwise the reason why not. */
  shrineAccess(s: Session, playerId: string): string | null;
  /** Game-specific instant effects. Returns a log line when it did something. */
  applyInstant?(draft: Session, playerId: string, def: PerkDef, perk: ActivePerk): string | void;
  /** Short status line, e.g. "Раунд 3 / 10". */
  status(s: Session): string;
  /** Called after undo or app reload — e.g. to pause a running clock. */
  onResume?(draft: Session): void;
  /** Called right before a shrine visit mutates the session. */
  beforeShrine?(draft: Session): void;
}
