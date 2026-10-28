import { describe, expect, it } from 'vitest';
import { makeSession, run } from './helpers';
import { grantPerk } from '../core/shrine';
import { perkDef } from '../core/perks/registry';
import { armTwin, checkSquare, chess, legalMoves, perkMove, perkTargets, playMove, type MoveOutcome } from '../games/chess/logic';
import type { Session } from '../core/types';

const play = (s: Session, ...moves: [string, string][]) =>
  moves.reduce((acc, [a, b]) => run(acc, (d) => playMove(d, a, b, 'q', 0)), s);

describe('chess on the table (mirror mode)', () => {
  it('defaults to the in-app board', () => {
    expect(chess(makeSession('chess', 2)).mode).toBe('mirror');
    expect(chess(makeSession('chess', 2, { board: 'real' })).mode).toBe('real');
  });

  it("plays a scholar's mate to the end", () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = play(s, ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']);
    const g = chess(s);
    expect(g.result).toEqual({ winner: 'w', reason: 'мат' });
    expect(s.status).toBe('finished');
    expect(g.moves.map((m) => m.san).join(' ')).toBe('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#');
    // pawn capture (1) + check (1)
    expect(s.players[0].souls).toBe(2);
  });

  it('rejects illegal moves and moves out of turn', () => {
    const s = makeSession('chess', 2, { clock: 'none' });
    let out: MoveOutcome | null = null;
    run(s, (d) => (out = playMove(d, 'e2', 'e5')));
    expect(out).toBeNull();
    run(s, (d) => (out = playMove(d, 'e7', 'e5')));
    expect(out).toBeNull();
  });

  it('reports castling and en passant squares for the 3D animation', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = play(s, ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']);
    let out: MoveOutcome | null = null;
    s = run(s, (d) => (out = playMove(d, 'e5', 'd6')));
    expect(out!.capturedAt).toBe('d5');
    s = play(s, ['a6', 'a5'], ['g1', 'f3'], ['a5', 'a4'], ['f1', 'e2'], ['a4', 'a3']);
    run(s, (d) => (out = playMove(d, 'e1', 'g1')));
    expect(out!.castle).toEqual({ rookFrom: 'h1', rookTo: 'f1' });
  });

  it('curses take moves off the table', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = run(s, (d) => grantPerk(d, 'p0', perkDef('c_icefile'), { file: 'e' }));
    expect(legalMoves(s, 'e2')).toHaveLength(0);
    expect(legalMoves(s).some((m) => m.from[0] === 'e')).toBe(false);
    expect(legalMoves(s, 'd2').length).toBeGreaterThan(0);
  });

  it('marks the king in check', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = play(s, ['e2', 'e4'], ['f7', 'f6'], ['d1', 'h5']);
    expect(checkSquare(s)).toBe('e8');
  });

  it('«Конский прыжок» lets a bishop jump like a knight and passes the turn', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = run(s, (d) => grantPerk(d, 'p0', perkDef('c_leap')));
    const uid = s.players[0].perks[0].uid;
    expect(perkTargets(s, uid, 'c1')).toEqual(expect.arrayContaining(['b3', 'd3']));
    s = run(s, (d) => perkMove(d, uid, 'c1', 'd3', 0));
    const g = chess(s);
    expect(g.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/3B4/PPPPPPPP/RN1QKBNR b')).toBe(true);
    expect(s.players[0].perks).toHaveLength(0);
  });

  it('«Двойной ход» keeps the turn for one extra move', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = run(s, (d) => grantPerk(d, 'p0', perkDef('c_twin')));
    s = run(s, (d) => armTwin(d, d.players[0].perks[0].uid));
    s = play(s, ['e2', 'e4']);
    expect(chess(s).toMove).toBe('w');
    s = play(s, ['d2', 'd4']);
    expect(chess(s).toMove).toBe('b');
  });

  it('«Дань» removes your own pawn without spending the move', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = run(s, (d) => grantPerk(d, 'p0', perkDef('c_tribute')));
    const uid = s.players[0].perks[0].uid;
    s = run(s, (d) => perkMove(d, uid, 'a2', 'a2', 0));
    const g = chess(s);
    expect(g.fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR');
    expect(g.toMove).toBe('w');
    expect(g.captured.b).toEqual(['p']);
  });

  it('«Воскрешение» returns a lost pawn to the home rank', () => {
    let s = makeSession('chess', 2, { clock: 'none' });
    s = play(s, ['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5'], ['a2', 'a3']);
    s = run(s, (d) => grantPerk(d, 'p1', perkDef('c_rise')));
    const uid = s.players[1].perks[0].uid;
    expect(perkTargets(s, uid, null)).toEqual(['d7']);
    s = run(s, (d) => perkMove(d, uid, 'd7', 'd7', 0));
    expect(chess(s).fen.split(' ')[0]).toBe('rnb1kbnr/pppppppp/8/3q4/8/P7/1PPP1PPP/RNBQKBNR');
    expect(chess(s).toMove).toBe('w');
  });
});
