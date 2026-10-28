import { create } from 'zustand';
import type { GameId } from '../core/types';

export type Screen = 'title' | 'hub' | 'setup' | 'play';
export type ModalId = 'codex' | 'settings' | 'roster' | 'chronicle' | 'pause' | 'log' | null;

interface NavState {
  screen: Screen;
  hubIndex: number;
  setupGame: GameId | null;
  modal: ModalId;
  codexTab: GameId | 'shrine' | 'about';
  shrineFor: string | null;
  sheetFor: string | null;
  banner: { id: number; text: string; color: string; sub?: string } | null;
  ask: { text: string; yes: string; onYes: () => void } | null;
  osd: { id: number; text: string; kind: 'play' | 'rec' | 'rew' | 'ff' | 'pause' | 'stop' } | null;
  /** VCR on-screen display message. */
  showOsd: (kind: 'play' | 'rec' | 'rew' | 'ff' | 'pause' | 'stop', text?: string) => void;
  /** Styled replacement for window.confirm. */
  confirm: (text: string, onYes: () => void, yes?: string) => void;
  dismissAsk: () => void;
  announce: (text: string, color?: string, sub?: string) => void;
  go: (screen: Screen) => void;
  setHub: (i: number) => void;
  setup: (game: GameId) => void;
  open: (m: ModalId, codexTab?: NavState['codexTab']) => void;
  close: () => void;
  openShrine: (playerId: string) => void;
  closeShrine: () => void;
  openSheet: (playerId: string | null) => void;
}

export const useNav = create<NavState>()((set) => ({
  screen: 'title',
  hubIndex: 0,
  setupGame: null,
  modal: null,
  codexTab: 'about',
  shrineFor: null,
  sheetFor: null,
  banner: null,
  ask: null,
  osd: null,
  showOsd: (kind, text) => {
    const labels = { play: 'PLAY ▶', rec: '● REC', rew: '◀◀ REW', ff: 'FF ▶▶', pause: 'PAUSE ❚❚', stop: 'STOP ■' } as const;
    const id = Date.now() + Math.random();
    set({ osd: { id, kind, text: text ?? labels[kind] } });
    setTimeout(() => {
      if (useNav.getState().osd?.id === id) set({ osd: null });
    }, kind === 'pause' ? 2600 : 1600);
  },
  confirm: (text, onYes, yes = 'Да') => set({ ask: { text, onYes, yes } }),
  dismissAsk: () => set({ ask: null }),
  announce: (text, color = '#f0c040', sub) => {
    const id = Date.now();
    navigator.vibrate?.(70);
    set({ banner: { id, text, color, sub } });
    setTimeout(() => {
      if (useNav.getState().banner?.id === id) set({ banner: null });
    }, 1900);
  },
  go: (screen) => set({ screen }),
  setHub: (hubIndex) => set({ hubIndex }),
  setup: (game) => set({ setupGame: game, screen: 'setup' }),
  open: (modal, codexTab) => set((s) => ({ modal, codexTab: codexTab ?? s.codexTab })),
  close: () => set({ modal: null }),
  openShrine: (shrineFor) => set({ shrineFor }),
  closeShrine: () => set({ shrineFor: null }),
  openSheet: (sheetFor) => set({ sheetFor }),
}));
