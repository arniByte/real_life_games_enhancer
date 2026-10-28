import { describe, expect, it } from 'vitest';
import { makeSession, run } from './helpers';
import { addDart, checkoutHint, darts, resolveTurn, turnIncome, type TurnMods } from '../games/darts/logic';
import { grantPerk } from '../core/shrine';
import { perkDef } from '../core/perks/registry';
import type { DartsGame } from '../games/darts/state';

const plain: TurnMods = { mult: 1, zero: false, bullUp: false, firstSingle: 1, cursed: [], shield: false };
const g = (over: Partial<DartsGame> = {}) => ({ ...(makeSession('darts', 2).game as DartsGame), ...over });

describe('darts x01', () => {
  it('subtracts a normal turn', () => {
    const r = resolveTurn(g(), 301, [{ n: 20, m: 3 }, { n: 20, m: 1 }, { n: 5, m: 1 }], plain);
    expect(r).toMatchObject({ scored: 85, newScore: 216, bust: false });
  });

  it('busts when going below zero', () => {
    const r = resolveTurn(g(), 40, [{ n: 20, m: 3 }], plain);
    expect(r.bust).toBe(true);
    expect(r.newScore).toBe(40);
  });

  it('requires a double to finish with double-out', () => {
    const game = g({ doubleOut: true });
    expect(resolveTurn(game, 40, [{ n: 20, m: 2 }], plain)).toMatchObject({ finished: true, newScore: 0 });
    expect(resolveTurn(game, 40, [{ n: 20, m: 1 }, { n: 20, m: 1 }], plain).bust).toBe(true);
    expect(resolveTurn(game, 50, [{ n: 25, m: 2 }], plain).finished).toBe(true);
  });

  it('burns the multiplier instead of busting', () => {
    const r = resolveTurn(g(), 60, [{ n: 20, m: 3 }], { ...plain, mult: 2 });
    expect(r).toMatchObject({ finished: true, bust: false });
    expect(r.notes.join()).toContain('множитель сгорел');
  });

  it('bust shield keeps darts before the bust', () => {
    const r = resolveTurn(g(), 50, [{ n: 20, m: 1 }, { n: 20, m: 3 }], { ...plain, shield: true });
    expect(r).toMatchObject({ bust: false, newScore: 30, usesShield: true, ends: true });
  });

  it('applies first-single upgrade, cursed number and bull upgrade', () => {
    const mods = { ...plain, firstSingle: 3, cursed: [19], bullUp: true };
    const r = resolveTurn(g({ mode: 'rounds' }), 0, [{ n: 19, m: 1 }, { n: 10, m: 1 }, { n: 25, m: 1 }], mods);
    expect(r.scored).toBe(0 + 30 + 50);
  });

  it('auto-commits after three darts and advances the player', () => {
    let s = makeSession('darts', 2);
    s = run(s, (d) => {
      addDart(d, { n: 20, m: 3 });
      addDart(d, { n: 20, m: 3 });
      addDart(d, { n: 20, m: 3 });
    });
    const game = darts(s);
    expect(game.scores.p0).toBe(121);
    expect(game.current).toBe(1);
    expect(s.players[0].souls).toBe(5);
  });

  it('fourth dart perk extends the turn', () => {
    let s = makeSession('darts', 2);
    s = run(s, (d) => {
      grantPerk(d, 'p0', perkDef('d_fourth'));
      for (let i = 0; i < 3; i++) addDart(d, { n: 1, m: 1 });
    });
    expect(darts(s).current).toBe(0);
    s = run(s, (d) => addDart(d, { n: 1, m: 1 }));
    expect(darts(s).current).toBe(1);
    expect(s.players[0].perks).toHaveLength(0);
  });

  it('catch-up soul goes to the last player at round end', () => {
    let s = makeSession('darts', 2);
    s = run(s, (d) => {
      for (let i = 0; i < 3; i++) addDart(d, { n: 20, m: 1 });
      for (let i = 0; i < 3; i++) addDart(d, { n: 1, m: 1 });
    });
    expect(darts(s).round).toBe(2);
    expect(s.players[1].souls).toBe(1);
    expect(s.players[0].souls).toBe(1);
  });

  it('income tiers', () => {
    expect(turnIncome([{ n: 20, m: 3 }, { n: 20, m: 3 }, { n: 20, m: 3 }])?.amount).toBe(5);
    expect(turnIncome([{ n: 20, m: 1 }, { n: 20, m: 1 }, { n: 10, m: 1 }])).toBeNull();
    expect(turnIncome([{ n: 25, m: 2 }, { n: 25, m: 1 }])?.amount).toBe(1 + 2);
  });

  it('suggests checkouts', () => {
    expect(checkoutHint(170, 3, true)).toBe('T20 T20 Яблочко');
    expect(checkoutHint(40, 1, true)).toBe('D20');
    expect(checkoutHint(169, 3, true)).toBeNull();
    expect(checkoutHint(3, 1, false)).toBe('3');
  });
});
