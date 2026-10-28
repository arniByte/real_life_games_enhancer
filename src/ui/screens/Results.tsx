import { Btn, PixelIcon, Souls, motion } from '../components/kit';
import { useApp } from '../../core/store';
import type { PlayerStats, Session } from '../../core/types';
import { GAME_LOGIC } from '../../games/logic';
import { GAME_META } from '../../games/meta';
import { useNav } from '../nav';
import { sfx } from '../../audio/sfx';
import { fx } from '../../three';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const AWARDS: { key: keyof PlayerStats | 'souls'; title: string; text: string }[] = [
  { key: 'blessings', title: 'Любимец богов', text: 'больше всех даров' },
  { key: 'curses', title: 'Проклятый', text: 'больше всех проклятий' },
  { key: 'soulsSpent', title: 'Транжира', text: 'спустил больше всех душ' },
  { key: 'hexesCast', title: 'Ведьма', text: 'чаще всех насылал сглаз' },
  { key: 'hexesTaken', title: 'Мишень', text: 'чаще всех был сглажен' },
  { key: 'souls', title: 'Скряга', text: 'унёс больше всех душ' },
];

export function Results({ session }: { session: Session }) {
  const logic = GAME_LOGIC[session.gameId];
  const meta = GAME_META[session.gameId];
  const order = session.standings ?? logic.standings(session);
  const winner = session.players.find((p) => p.id === order[0])!;
  const draw = session.gameId === 'chess' && (session.game as { result?: { winner: string } }).result?.winner === 'draw';
  const { go } = useNav();

  const awards = session.enhancer.enabled
    ? AWARDS.map((a) => {
        const val = (id: string) => {
          const p = session.players.find((x) => x.id === id)!;
          return a.key === 'souls' ? p.souls : p.stats[a.key];
        };
        const best = session.players.slice().sort((x, y) => val(y.id) - val(x.id))[0];
        const v = val(best.id);
        const tie = session.players.filter((p) => val(p.id) === v).length > 1;
        return v > 0 && !tie ? { ...a, player: best, v } : null;
      }).filter(Boolean)
    : [];

  const rematch = () => {
    const prefs = useApp.getState().setups[session.gameId];
    if (!prefs) return;
    useApp.getState().startSession(session.gameId, prefs.playerIds, prefs.options, prefs.enhancer);
    sfx.start();
    fx({ type: 'flash', color: meta.accent, strength: 0.5 });
  };

  const toMenu = () => {
    sfx.back();
    useApp.getState().closeSession();
    go('hub');
  };

  return (
    <motion.div className="results-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.6 }}>
      <motion.div
        className="panel solid results"
        initial={{ scale: 0.85, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 180, damping: 18 }}
      >
        <div className="results-head" style={{ ['--pc' as string]: winner.color }}>
          <div className="field-label">{meta.world}</div>
          <motion.div className="results-title" initial={{ letterSpacing: '0.6em', opacity: 0 }} animate={{ letterSpacing: '0.12em', opacity: 1 }} transition={{ delay: 1.1, duration: 1 }}>
            {draw ? 'НИЧЬЯ' : 'ПОБЕДА'}
          </motion.div>
          {!draw && (
            <div className="results-winner">
              <PixelIcon id={winner.sigil} color={winner.color} size={30} />
              <span style={{ color: winner.color }}>{winner.name}</span>
            </div>
          )}
          <div className="dim" style={{ fontSize: 14 }}>
            {logic.status(session)}
          </div>
        </div>

        <div className="results-list">
          {order.map((id, i) => {
            const p = session.players.find((x) => x.id === id)!;
            const sv = logic.scoreView(session, id);
            return (
              <motion.div key={id} className={`results-row ${i === 0 ? 'first' : ''}`} style={{ ['--pc' as string]: p.color }} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.3 + i * 0.12 }}>
                <span className="results-place title-font">{ROMAN[i]}</span>
                <PixelIcon id={p.sigil} color={p.color} size={20} />
                <span className="grow" style={{ color: p.color }}>
                  {p.name}
                </span>
                <span className="title-font" style={{ fontSize: 24 }}>
                  {sv.main}
                </span>
                {session.enhancer.enabled && <Souls n={p.souls} size={14} />}
              </motion.div>
            );
          })}
        </div>

        {awards.length > 0 && (
          <div className="awards">
            {awards.map((a) => (
              <div key={a!.title} className="award">
                <div className="award-title">{a!.title}</div>
                <div className="award-who" style={{ color: a!.player.color }}>
                  {a!.player.name}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {a!.text} · {a!.v}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="row wrap" style={{ justifyContent: 'center', gap: 8, padding: '4px 14px 16px' }}>
          <Btn variant="ghost" onClick={() => useApp.getState().undo()}>
            ↶ Отменить
          </Btn>
          <Btn variant="ghost" onClick={toMenu}>
            В меню
          </Btn>
          <Btn variant="primary" size="big" onClick={rematch}>
            Реванш
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}
