import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { produce } from 'immer';
import type { EnhancerSettings, GameId, IconId, RosterPlayer, Session, SessionPlayer } from './types';
import { GAME_LOGIC } from '../games/logic';
import { freshSeed } from './rng';
import { log } from './session';

export const PLAYER_COLORS = ['#d9433b', '#e8a33d', '#7fb24a', '#3fb3a6', '#4a86d9', '#9a62d6', '#d65c9a', '#d8cfb8'];
export const SIGILS: IconId[] = ['skull', 'crown', 'eye', 'moon', 'flame', 'rose', 'spider', 'key', 'star', 'bat', 'dagger', 'sun'];

export interface Settings {
  volume: number;
  music: boolean;
  /** Internal render height in pixels. */
  resolution: 240 | 320 | 480;
  /** Vertex snapping strength: 0 off, 1 subtle, 2 classic. */
  jitter: 0 | 1 | 2;
  crt: boolean;
  reducedMotion: boolean;
}

export interface ChronicleEntry {
  id: string;
  gameId: GameId;
  at: number;
  title: string;
  players: { name: string; color: string; sigil: IconId; place: number; score: string }[];
}

export interface SetupPrefs {
  playerIds: string[];
  options: Record<string, unknown>;
  enhancer: EnhancerSettings;
}

interface AppState {
  roster: RosterPlayer[];
  /** Last setup per game — prefilled next time and used for rematches. */
  setups: Partial<Record<GameId, SetupPrefs>>;
  settings: Settings;
  session: Session | null;
  past: Session[];
  future: Session[];
  chronicle: ChronicleEntry[];
  /** Run a mutation on the session with undo support. Returns the mutation's result. */
  act: <T>(fn: (draft: Session) => T, opts?: { undoable?: boolean }) => T | undefined;
  undo: () => void;
  redo: () => void;
  startSession: (gameId: GameId, playerIds: string[], options: Record<string, unknown>, enhancer: EnhancerSettings) => void;
  closeSession: () => void;
  addRosterPlayer: (name: string) => RosterPlayer;
  updateRosterPlayer: (id: string, patch: Partial<Omit<RosterPlayer, 'id'>>) => void;
  removeRosterPlayer: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  saveSetup: (game: GameId, prefs: SetupPrefs) => void;
  clearChronicle: () => void;
}

const UNDO_LIMIT = 60;
const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  music: true,
  resolution: 240,
  jitter: 2,
  crt: true,
  reducedMotion: false,
};

function chronicleOf(s: Session): ChronicleEntry {
  const logic = GAME_LOGIC[s.gameId];
  const order = s.standings ?? logic.standings(s);
  return {
    id: s.id,
    gameId: s.gameId,
    at: Date.now(),
    title: logic.status(s),
    players: order.map((id, i) => {
      const p = s.players.find((pl) => pl.id === id)!;
      return { name: p.name, color: p.color, sigil: p.sigil, place: i + 1, score: logic.scoreView(s, id).main };
    }),
  };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      roster: [],
      setups: {},
      settings: DEFAULT_SETTINGS,
      session: null,
      past: [],
      future: [],
      chronicle: [],

      act(fn, opts) {
        const { session, past, chronicle } = get();
        if (!session) return undefined;
        let result: ReturnType<typeof fn> | undefined;
        let next: Session;
        try {
          next = produce(session, (draft) => {
            const r = fn(draft as Session);
            // Results may reference draft objects that die with the proxy — detach them.
            result = r && typeof r === 'object' ? JSON.parse(JSON.stringify(r)) : r;
          });
        } catch (err) {
          console.warn('[act] rejected:', err);
          return undefined;
        }
        if (next === session) return result;
        const finishedNow = session.status === 'playing' && next.status === 'finished';
        set({
          session: next,
          past: opts?.undoable === false ? past : [...past, session].slice(-UNDO_LIMIT),
          future: [],
          chronicle: finishedNow ? [chronicleOf(next), ...chronicle].slice(0, 40) : chronicle,
        });
        return result;
      },

      undo() {
        const { past, session, future, chronicle } = get();
        if (!past.length || !session) return;
        const prev = produce(past[past.length - 1], (d) => {
          GAME_LOGIC[d.gameId].onResume?.(d as Session);
          log(d as Session, '↶ Отмена', 'system');
        });
        set({
          session: prev,
          past: past.slice(0, -1),
          future: [session, ...future].slice(0, UNDO_LIMIT),
          chronicle: session.status === 'finished' && prev.status === 'playing' ? chronicle.filter((c) => c.id !== session.id) : chronicle,
        });
      },

      redo() {
        const { past, session, future } = get();
        if (!future.length || !session) return;
        const next = produce(future[0], (d) => GAME_LOGIC[d.gameId].onResume?.(d as Session));
        set({ session: next, past: [...past, session], future: future.slice(1) });
      },

      startSession(gameId, playerIds, options, enhancer) {
        const roster = get().roster;
        const known = playerIds.filter((id) => roster.some((p) => p.id === id));
        if (known.length === 0) return;
        const players: SessionPlayer[] = known.map((id) => {
          const r = roster.find((p) => p.id === id)!;
          return {
            ...r,
            souls: enhancer.enabled ? enhancer.startSouls : 0,
            perks: [],
            doom: 0,
            stats: { soulsEarned: 0, soulsSpent: 0, spins: 0, blessings: 0, curses: 0, hexesCast: 0, hexesTaken: 0 },
          };
        });
        const logic = GAME_LOGIC[gameId];
        const session: Session = {
          id: uid(),
          gameId,
          createdAt: Date.now(),
          enhancer,
          players,
          game: logic.createGame(players, options),
          log: [],
          logSeq: 0,
          status: 'playing',
          rng: freshSeed(),
          turnNo: 0,
          uidSeq: 0,
        };
        log(session, 'Игра началась. Да помогут вам боги.', 'system');
        set({ session, past: [], future: [] });
      },

      closeSession() {
        set({ session: null, past: [], future: [] });
      },

      addRosterPlayer(name) {
        const roster = get().roster;
        const used = new Set(roster.map((p) => p.color));
        const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[roster.length % PLAYER_COLORS.length];
        const usedSigils = new Set(roster.map((p) => p.sigil));
        const sigil = SIGILS.find((c) => !usedSigils.has(c)) ?? SIGILS[roster.length % SIGILS.length];
        const p: RosterPlayer = { id: uid(), name: name.trim().slice(0, 16) || 'Безымянный', color, sigil };
        set({ roster: [...roster, p] });
        return p;
      },

      updateRosterPlayer(id, patch) {
        set({ roster: get().roster.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
      },

      removeRosterPlayer(id) {
        set({ roster: get().roster.filter((p) => p.id !== id) });
      },

      setSettings(patch) {
        set({ settings: { ...get().settings, ...patch } });
      },

      saveSetup(game, prefs) {
        set({ setups: { ...get().setups, [game]: prefs } });
      },

      clearChronicle() {
        set({ chronicle: [] });
      },
    }),
    {
      name: 'rlge-save-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ roster: s.roster, setups: s.setups, settings: s.settings, session: s.session, chronicle: s.chronicle }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>;
        let session = p.session ?? null;
        if (session) session = produce(session, (d) => GAME_LOGIC[d.gameId].onResume?.(d as Session));
        return { ...current, ...p, session, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

/** Mutate the session (shorthand outside React). */
export const act = <T,>(fn: (draft: Session) => T, opts?: { undoable?: boolean }) => useApp.getState().act(fn, opts);
