import { describe, expect, it } from 'vitest';
import { makeSession, run } from './helpers';
import { OUTCOMES, castHex, choosePact, grantPerk, hexCost, openPact, spinWheel, wheelCost, wheelOdds } from '../core/shrine';
import { ALL_PERKS, perkDef } from '../core/perks/registry';
import { awardSouls } from '../core/session';
import { addDart } from '../games/darts/logic';
import type { Session } from '../core/types';

const rich = (s: Session) => run(s, (d) => d.players.forEach((p) => (p.souls = 50)));

describe('perk content', () => {
  it('has unique ids and sane durations', () => {
    const ids = new Set<string>();
    for (const p of ALL_PERKS) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      if (p.duration.type === 'charges' || p.duration.type === 'ticks') expect(p.duration.n).toBeGreaterThan(0);
      if (p.text.includes('{')) expect(p.params, p.id).toBeDefined();
    }
  });

  it('every game has blessings and curses in common/rare/epic', () => {
    for (const game of ['darts', 'chess', 'durak', 'pingpong', 'universal'] as const) {
      for (const kind of ['blessing', 'curse'] as const)
        for (const rarity of ['common', 'rare', 'epic'] as const) {
          const n = ALL_PERKS.filter((p) => (p.game === game || p.game === 'any') && p.kind === kind && p.rarity === rarity).length;
          expect(n, `${game} ${kind} ${rarity}`).toBeGreaterThan(0);
        }
    }
  });
});

describe('wheel odds', () => {
  it('normalizes to 1', () => {
    const s = makeSession('darts', 4);
    const odds = wheelOdds(s, 'p0');
    expect(OUTCOMES.reduce((a, o) => a + odds[o], 0)).toBeCloseTo(1, 6);
  });

  it('favors the last player', () => {
    let s = makeSession('darts', 3);
    s = run(s, (d) => {
      for (let i = 0; i < 3; i++) addDart(d, { n: 20, m: 3 });
      for (let i = 0; i < 3; i++) addDart(d, { n: 10, m: 1 });
      for (let i = 0; i < 3; i++) addDart(d, { n: 1, m: 1 });
    });
    const leader = wheelOdds(s, 'p0');
    const last = wheelOdds(s, 'p2');
    const curse = (o: typeof leader) => o.curse_common + o.curse_rare + o.curse_epic;
    expect(curse(last)).toBeLessThan(curse(leader));
    expect(last.bless_legendary).toBeGreaterThan(leader.bless_legendary);
  });

  it('pity removes curses after two in a row', () => {
    const s = run(makeSession('darts', 2), (d) => void (d.players[0].doom = 2));
    const o = wheelOdds(s, 'p0');
    expect(o.curse_common + o.curse_rare + o.curse_epic).toBe(0);
  });

  it('calm chaos lowers curses', () => {
    const calm = wheelOdds(makeSession('darts', 2, {}, { chaos: 'calm' }), 'p0');
    const mad = wheelOdds(makeSession('darts', 2, {}, { chaos: 'mayhem' }), 'p0');
    expect(calm.curse_common).toBeLessThan(mad.curse_common);
  });

  it('empirical distribution matches odds', () => {
    let s = rich(makeSession('universal', 2));
    const counts: Record<string, number> = {};
    const N = 3000;
    s = run(s, (d) => {
      for (let i = 0; i < N; i++) {
        d.players[0].souls = 10;
        d.players[0].perks = [];
        d.players[0].doom = 0;
        const r = spinWheel(d, 'p0');
        counts[r.outcome!] = (counts[r.outcome!] ?? 0) + 1;
      }
    });
    const odds = wheelOdds(makeSession('universal', 2), 'p0');
    expect(counts.bless_common / N).toBeCloseTo(odds.bless_common, 1);
    expect(s.players[0].stats.spins).toBe(N);
  });
});

describe('shrine offerings', () => {
  it('wheel costs a soul, free with favor', () => {
    let s = rich(makeSession('darts', 2));
    expect(wheelCost(s, 'p0')).toBe(1);
    s = run(s, (d) => grantPerk(d, 'p0', perkDef('g_favor')));
    expect(wheelCost(s, 'p0')).toBe(0);
    s = run(s, (d) => spinWheel(d, 'p0'));
    expect(s.players[0].stats.soulsSpent).toBe(0);
    expect(s.players[0].perks.some((k) => k.defId === 'g_favor')).toBe(false);
  });

  it('pact offers distinct blessings and grants the chosen one', () => {
    let s = rich(makeSession('chess', 2, { clock: '5+3' }));
    s = run(s, (d) => openPact(d, 'p0'));
    expect(s.pact?.choices).toHaveLength(3);
    expect(new Set(s.pact!.choices).size).toBe(3);
    const chosen = s.pact!.choices[1];
    s = run(s, (d) => choosePact(d, 1));
    expect(s.pact).toBeUndefined();
    expect(s.players[0].souls).toBe(47);
    expect(s.players[0].stats.blessings).toBeGreaterThanOrEqual(1);
    const def = perkDef(chosen);
    if (def.duration.type !== 'instant') expect(s.players[0].perks.some((k) => k.defId === chosen)).toBe(true);
  });

  it('hex is cheaper against the leader and blocked by a ward', () => {
    let s = rich(makeSession('universal', 3));
    s = run(s, (d) => {
      (d.game as { scores: Record<string, number> }).scores.p1 = 10;
    });
    expect(hexCost(s, 'p0', 'p1')).toBe(1);
    expect(hexCost(s, 'p0', 'p2')).toBe(2);
    s = run(s, (d) => grantPerk(d, 'p1', perkDef('g_ward')));
    let res: ReturnType<typeof castHex> | undefined;
    s = run(s, (d) => void (res = JSON.parse(JSON.stringify(castHex(d, 'p0', 'p1')))));
    expect(res?.warded).toBe(true);
    expect(s.players[1].perks).toHaveLength(0);
  });

  it('mirror reflects a hex', () => {
    let s = rich(makeSession('durak', 3));
    s = run(s, (d) => grantPerk(d, 'p1', perkDef('g_mirror')));
    s = run(s, (d) => castHex(d, 'p0', 'p1'));
    expect(s.players[1].perks.filter((k) => k.kind === 'curse')).toHaveLength(0);
    expect(s.players[0].stats.curses).toBe(1);
  });

  it('income bonus and tax', () => {
    let s = makeSession('darts', 2);
    s = run(s, (d) => {
      grantPerk(d, 'p0', perkDef('g_harvest'));
      awardSouls(d, 'p0', 2, 't');
    });
    expect(s.players[0].souls).toBe(3);
    s = run(s, (d) => {
      grantPerk(d, 'p1', perkDef('g_tax'));
      awardSouls(d, 'p1', 1, 't');
    });
    expect(s.players[1].souls).toBe(0);
  });

  it('slot cap evicts the oldest blessing', () => {
    let s = makeSession('darts', 2);
    s = run(s, (d) => {
      for (const id of ['d_shield', 'd_step', 'd_rethrow', 'd_ring', 'd_bull']) grantPerk(d, 'p0', perkDef(id));
    });
    expect(s.players[0].perks.map((k) => k.defId)).toEqual(['d_step', 'd_rethrow', 'd_ring', 'd_bull']);
  });
});
