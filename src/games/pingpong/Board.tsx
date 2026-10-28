import type { Session } from '../../core/types';
import { act, useApp } from '../../core/store';
import { player } from '../../core/session';
import { PixelIcon, motion } from '../../ui/components/kit';
import { useNav } from '../../ui/nav';
import { fx } from '../../three';
import { Num } from '../../ui/pixel/Type';
import { sfx } from '../../audio/sfx';
import { gamesToWin, pong, scorePoint, server } from './logic';

export function PingPongBoard({ session }: { session: Session }) {
  const g = pong(session);
  const announce = useNav((s) => s.announce);
  if (session.status !== 'playing') return null;
  const srv = server(g);
  const deuce = g.points[g.ids[0]] >= g.pointsToWin - 1 && g.points[g.ids[1]] >= g.pointsToWin - 1;

  const point = (side: 0 | 1) => {
    const id = g.ids[side];
    const gamesBefore = pong(useApp.getState().session!).history.length;
    act((s) => scorePoint(s, id));
    const p = player(session, id);
    fx({ type: 'pp.point', side, color: p.color });
    sfx.point();
    const after = pong(useApp.getState().session!);
    if (after.history.length > gamesBefore && useApp.getState().session!.status === 'playing') {
      announce('ПАРТИЯ', p.color, p.name);
      sfx.blessing(1);
    } else if (after.lastPoint?.note) {
      announce(after.lastPoint.value === 0 ? 'СТЕНА' : `+${after.lastPoint.value}`, '#8ff0ff', after.lastPoint.note);
    }
  };

  return (
    <div className="pong">
      <div className="pong-halves">
        {g.ids.map((id, i) => {
          const p = player(session, id);
          return (
            <motion.button key={id} type="button" className={`pong-half ${srv === id ? 'serving' : ''}`} style={{ ['--pc' as string]: p.color }} onClick={() => point(i as 0 | 1)} whileTap={{ scale: 0.97 }}>
              <div className="pong-name">
                <PixelIcon id={p.sigil} color={p.color} size={18} /> {p.name}
              </div>
              <motion.div key={g.points[id]} className="dither-in" initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ duration: 0.2, ease: (t: number) => Math.floor(t * 4) / 4 }}>
                <Num size={40} tone={srv === id ? 'gold' : 'bone'}>
                  {g.points[id]}
                </Num>
              </motion.div>
              <div className="pong-games">
                {Array.from({ length: gamesToWin(g) }, (_, k) => (
                  <i key={k} className={k < g.games[id] ? 'on' : ''} />
                ))}
              </div>
              <div className="pong-serve">{srv === id ? '● ПОДАЁТ' : ' '}</div>
            </motion.button>
          );
        })}
      </div>
      <div className="pong-hint">
        {deuce ? 'Больше-меньше: подача каждое очко, нужен отрыв в 2' : 'Жми половину того, кто выиграл розыгрыш · подача меняется каждые 2 очка'}
      </div>
    </div>
  );
}
