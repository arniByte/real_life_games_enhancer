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
  announce: (text, color = '#f0c040', sub) => {
    const id = Date.now();
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
