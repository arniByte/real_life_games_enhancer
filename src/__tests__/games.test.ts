import { describe, expect, it } from 'vitest';
import { makeSession, run } from './helpers';
import { grantPerk } from '../core/shrine';
import { perkDef } from '../core/perks/registry';
import { drawRound, durak, playerOut } from '../games/durak/logic';
import { pointsToGame, pong, scorePoint, server } from '../games/pingpong/logic';
import { chess, hitClock, registerCapture, remainingMs, startClock } from '../games/chess/logic';
import { addPoints, nextTurn, uni } from '../games/universal/logic';

describe('durak', () => {
  it('ends a round when one player is left and counts the fool', () => {
    let s = makeSession('durak', 3, { foolLimit: 2 });
    s = run(s, (d) => {
      playerOut(d, 'p1');
      playerOut(d, 'p0');
    });
    expect(durak(s).fools.p2).toBe(1);
    expect(durak(s).round).toBe(2);
    expect(s.players[1].souls).toBe(2);
    expect(s.players[2].souls).toBe(1);
  });

  it('fool mask cancels and double shame doubles', () => {
    let s = makeSession('durak', 2, { foolLimit: 3 });
    s = run(s, (d) => {
      grantPerk(d, 'p1', perkDef('k_fool_shield'));
      playerOut(d, 'p0');
    });
    expect(durak(s).fools.p1).toBe(0);
    s = run(s, (d) => {
      grantPerk(d, 'p1', perkDef('k_double_fool'));
      playerOut(d, 'p0');
    });
    expect(durak(s).fools.p1).toBe(2);
  });

  it('finishes at the fool limit; draws count nobody', () => {
    let s = makeSession('durak', 2, { foolLimit: 1 });
    s = run(s, (d) => drawRound(d));
    expect(s.status).toBe('playing');
    s = run(s, (d) => playerOut(d, 'p1'));
    expect(s.status).toBe('finished');
    expect(s.standings).toEqual(['p1', 'p0']);
  });
});

describe('ping-pong', () => {
  it('rotates serve every two points and every point at deuce', () => {
    let s = makeSession('pingpong', 2, { points: 11, bestOf: 1 });
    expect(server(pong(s))).toBe('p0');
    s = run(s, (d) => {
      scorePoint(d, 'p0');
      scorePoint(d, 'p1');
    });
    expect(server(pong(s))).toBe('p1');
    s = run(s, (d) => {
      const g = pong(d);
      g.points = { p0: 10, p1: 10 };
    });
    expect(server(pong(s))).toBe('p0');
    s = run(s, (d) => scorePoint(d, 'p0'));
    expect(server(pong(s))).toBe('p1');
  });

  it('wins a game by two and the match', () => {
    let s = makeSession('pingpong', 2, { points: 11, bestOf: 1 });
    s = run(s, (d) => {
      for (let i = 0; i < 11; i++) scorePoint(d, 'p1');
    });
    expect(s.status).toBe('finished');
    expect(s.standings?.[0]).toBe('p1');
  });

  it('double point is capped by what is needed and the wall blocks', () => {
    let s = makeSession('pingpong', 2, { points: 11, bestOf: 3 });
    s = run(s, (d) => {
      pong(d).points = { p0: 10, p1: 3 };
      grantPerk(d, 'p0', perkDef('p_double'));
    });
    expect(pointsToGame(pong(s), 'p0')).toBe(1);
    s = run(s, (d) => scorePoint(d, 'p0'));
    expect(pong(s).games.p0).toBe(1);
    s = run(s, (d) => {
      grantPerk(d, 'p1', perkDef('p_wall'));
      scorePoint(d, 'p0');
    });
    expect(pong(s).points.p0).toBe(0);
  });
});

describe('chess', () => {
  it('runs the clock with increment and rate perks', () => {
    let s = makeSession('chess', 2, { clock: '1+2' });
    s = run(s, (d) => startClock(d, 0));
    expect(remainingMs(s, 'w', 10_000)).toBe(50_000);
    s = run(s, (d) => hitClock(d, 10_000));
    expect(chess(s).clock.remaining.w).toBe(52_000);
    expect(chess(s).toMove).toBe('b');
    s = run(s, (d) => grantPerk(d, 'p1', perkDef('c_viscous')));
    expect(remainingMs(s, 'b', 20_000)).toBe(55_000);
  });

  it('rewards captures and revenge', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = run(s, (d) => registerCapture(d, 'q'));
    expect(s.players[0].souls).toBe(5);
    expect(s.players[1].souls).toBe(2);
  });
});

describe('universal', () => {
  it('applies multipliers and shields', () => {
    let s = makeSession('universal', 2, { step: 10 });
    s = run(s, (d) => {
      grantPerk(d, 'p0', perkDef('u_double'));
      addPoints(d, 'p0', 10);
      grantPerk(d, 'p1', perkDef('u_shield'));
      addPoints(d, 'p1', -10);
    });
    expect(uni(s).scores).toEqual({ p0: 20, p1: 0 });
  });

  it('round end rewards the best round and the last place', () => {
    let s = makeSession('universal', 2);
    s = run(s, (d) => {
      addPoints(d, 'p0', 5);
      nextTurn(d);
      nextTurn(d);
    });
    expect(uni(s).round).toBe(2);
    expect(s.players[0].souls).toBe(1);
    expect(s.players[1].souls).toBe(1);
  });

  it('steal takes from the leader', () => {
    let s = makeSession('universal', 3, { step: 5 });
    s = run(s, (d) => {
      uni(d).scores.p2 = 50;
      grantPerk(d, 'p0', perkDef('u_rob'));
    });
    expect(uni(s).scores).toMatchObject({ p0: 10, p2: 40 });
  });
});
