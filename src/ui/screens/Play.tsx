import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, Btn, Modal, PixelIcon, Souls, motion } from '../components/kit';
import { PerkCard, PerkChip } from '../components/Perk';
import { useNav } from '../nav';
import { act, useApp } from '../../core/store';
import type { Session } from '../../core/types';
import { GAME_META } from '../../games/meta';
import { GAME_LOGIC } from '../../games/logic';
import { BOARDS } from '../../games/boards';
import { perkDef } from '../../core/perks/registry';
import { log, player, spendCharge, removePerk } from '../../core/session';
import { shrineBlock } from '../../core/shrine';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';
import { Shrine } from './Shrine';
import { Results } from './Results';

export function Play() {
  const session = useApp((s) => s.session);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const { open, shrineFor, sheetFor, openSheet, go } = useNav();

  useSessionFx();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useApp.getState().redo();
        else useApp.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) {
    return (
      <div className="center" style={{ height: '100%' }}>
        <Btn onClick={() => go('hub')}>В меню</Btn>
      </div>
    );
  }

  const meta = GAME_META[session.gameId];
  const logic = GAME_LOGIC[session.gameId];
  const Board = BOARDS[session.gameId];
  const current = logic.currentPlayerId(session);
  const standings = logic.standings(session);

  if (shrineFor) {
    return (
      <div className="play">
        <AnimatePresence>
          <Shrine key="shrine" playerId={shrineFor} />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="play" style={{ ['--accent' as string]: meta.accent }}>
      <div className="play-top">
        <Btn size="small" icon onClick={() => open('pause')} aria-label="Меню">
          ☰
        </Btn>
        <div className="play-title grow">
          <div className="title-font play-world">{meta.world}</div>
          <div className="play-status">{logic.status(session)}</div>
        </div>
        <Btn size="small" icon onClick={() => useApp.getState().undo()} disabled={!canUndo} aria-label="Отменить" title="Отменить (Ctrl+Z)">
          ↶
        </Btn>
        <Btn size="small" icon onClick={() => useApp.getState().redo()} disabled={!canRedo} aria-label="Повторить" title="Повторить">
          ↷
        </Btn>
      </div>

      <div className="players">
        {session.players.map((p) => (
          <PlayerCard key={p.id} session={session} pid={p.id} active={p.id === current} place={standings.indexOf(p.id) + 1} onOpen={() => openSheet(p.id)} />
        ))}
      </div>

      <div className="play-mid">
        <Feed session={session} />
      </div>

      {session.status === 'playing' && (
        <motion.div className="play-console panel" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
          {session.enhancer.enabled && <ShrineButton session={session} />}
          <Board session={session} />
        </motion.div>
      )}

      <AnimatePresence>{sheetFor && <PlayerSheet key="sheet" session={session} pid={sheetFor} onClose={() => openSheet(null)} />}</AnimatePresence>
      <AnimatePresence>{session.status === 'finished' && <Results key="results" session={session} />}</AnimatePresence>
    </div>
  );
}

function PlayerCard({ session, pid, active, place, onOpen }: { session: Session; pid: string; active: boolean; place: number; onOpen: () => void }) {
  const p = player(session, pid);
  const sv = GAME_LOGIC[session.gameId].scoreView(session, pid);
  return (
    <button type="button" className={`pcard ${active ? 'active' : ''}`} style={{ ['--pc' as string]: p.color }} onClick={onOpen}>
      <div className="pcard-head">
        <PixelIcon id={p.sigil} color={p.color} size={18} />
        <span className="pcard-name">{p.name}</span>
        {session.enhancer.enabled && <Souls n={p.souls} size={15} />}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={sv.main} className="pcard-score" initial={{ y: -12, opacity: 0, scale: 1.3 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.25 }}>
          {sv.main}
        </motion.div>
      </AnimatePresence>
      <div className="pcard-sub">{sv.sub}</div>
      {session.enhancer.enabled && (
        <div className="pcard-perks">
          {p.perks.map((k) => (
            <PerkChip key={k.uid} perk={k} onClick={onOpen} size={26} />
          ))}
        </div>
      )}
      {session.players.length > 2 && <span className="pcard-place">#{place}</span>}
    </button>
  );
}

function Feed({ session }: { session: Session }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const lines = session.log.filter((l) => now - l.at < 7000 && l.tone !== 'system').slice(-4);
  return (
    <div className="feed">
      <AnimatePresence initial={false}>
        {lines.map((l) => (
          <motion.div key={l.id} layout className={`feed-line ${l.tone}`} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0, x: -10 }}>
            {l.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ShrineButton({ session }: { session: Session }) {
  const openShrine = useNav((s) => s.openShrine);
  const [picking, setPicking] = useState(false);
  const logic = GAME_LOGIC[session.gameId];
  const current = logic.currentPlayerId(session);
  const eligible = session.players.filter((p) => shrineBlock(session, p.id) === null);
  const pending = session.pact ? session.pact.playerId : null;
  const reason = current ? shrineBlock(session, current) : shrineBlock(session, session.players[0].id);

  const onClick = () => {
    if (pending) return openShrine(pending);
    if (eligible.length === 1) return openShrine(eligible[0].id);
    if (eligible.length > 1) {
      setPicking(true);
      return;
    }
    sfx.error();
  };

  const label = pending
    ? 'Пакт ждёт выбора'
    : eligible.length === 1
      ? `Алтарь · ${eligible[0].name}`
      : eligible.length > 1
        ? 'Алтарь Судеб'
        : reason ?? 'Алтарь закрыт';

  return (
    <>
      <Btn variant="soul" block className="shrine-btn" onClick={onClick} disabled={!pending && eligible.length === 0} title={reason ?? undefined}>
        <PixelIcon id="eye" color="#8ff0ff" size={18} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {eligible.length === 1 && <Souls n={eligible[0].souls} size={15} />}
      </Btn>
      <AnimatePresence>
        {picking && (
          <Modal title="Кто идёт к алтарю?" onClose={() => setPicking(false)}>
            <div className="col" style={{ gap: 8 }}>
              {eligible.map((p) => (
                <Btn
                  key={p.id}
                  block
                  size="big"
                  onClick={() => {
                    setPicking(false);
                    openShrine(p.id);
                  }}
                  style={{ justifyContent: 'flex-start', ['--pc' as string]: p.color }}
                >
                  <PixelIcon id={p.sigil} color={p.color} size={22} />
                  <span className="grow" style={{ textAlign: 'left', color: p.color }}>
                    {p.name}
                  </span>
                  <Souls n={p.souls} />
                </Btn>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function PlayerSheet({ session, pid, onClose }: { session: Session; pid: string; onClose: () => void }) {
  const p = player(session, pid);
  const st = p.stats;
  const blessings = p.perks.filter((k) => k.kind === 'blessing');
  const curses = p.perks.filter((k) => k.kind === 'curse');
  const nameOf = (id?: string) => (id ? session.players.find((x) => x.id === id)?.name : undefined);

  const use = (uid: string) => {
    act((d) => {
      const def = perkDef(player(d, pid).perks.find((k) => k.uid === uid)!.defId);
      log(d, `${p.name} использует «${def.name}»`, def.kind === 'blessing' ? 'good' : 'bad');
      spendCharge(d, pid, uid, true);
    });
    sfx.confirm();
    fx({ type: 'flash', color: p.color, strength: 0.3 });
  };
  const drop = (uid: string) => {
    act((d) => {
      const def = perkDef(player(d, pid).perks.find((k) => k.uid === uid)!.defId);
      log(d, `${p.name}: «${def.name}» снят вручную`, 'system');
      removePerk(player(d, pid), uid);
    });
    sfx.back();
  };
  const adjust = (n: number) => {
    act((d) => {
      const pl = player(d, pid);
      pl.souls = Math.max(0, pl.souls + n);
      log(d, `${pl.name}: ${n > 0 ? '+' : ''}${n} душ (правка ведущего)`, 'system');
    });
    sfx.click();
  };

  const section = (title: string, list: typeof p.perks) => (
    <div className="col" style={{ gap: 8 }}>
      <h3 className="h-section">{title}</h3>
      {list.length === 0 && <div className="faint">Пусто.</div>}
      <div className="sheet-perks">
        {list.map((k) => {
          const def = perkDef(k.defId);
          const manual = def.duration.type === 'charges' && !def.effect;
          return (
            <div key={k.uid} className="col" style={{ gap: 6 }}>
              <PerkCard def={def} params={k.params} left={k.left} game={session.gameId} compact from={nameOf(k.fromId)} />
              <div className="row" style={{ gap: 6 }}>
                {manual && (
                  <Btn size="small" variant="gold" className="grow" onClick={() => use(k.uid)}>
                    Использовать
                  </Btn>
                )}
                <Btn size="small" variant="ghost" className={manual ? '' : 'grow'} onClick={() => drop(k.uid)}>
                  {def.kind === 'curse' ? 'Снять' : 'Сбросить'}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="col" style={{ gap: 18 }}>
        {session.enhancer.enabled && (
          <div className="row wrap" style={{ gap: 10 }}>
            <Souls n={p.souls} size={26} />
            <Btn size="small" onClick={() => adjust(-1)}>
              −1
            </Btn>
            <Btn size="small" onClick={() => adjust(1)}>
              +1
            </Btn>
            <span className="faint" style={{ fontSize: 13 }}>
              правка ведущего
            </span>
          </div>
        )}
        {section('Дары', blessings)}
        {section('Проклятия', curses)}
        <div className="stats-grid">
          <Stat label="Душ добыто" v={st.soulsEarned} />
          <Stat label="Душ потрачено" v={st.soulsSpent} />
          <Stat label="Вращений" v={st.spins} />
          <Stat label="Даров" v={st.blessings} />
          <Stat label="Проклятий" v={st.curses} />
          <Stat label="Сглазов наслал" v={st.hexesCast} />
        </div>
      </div>
    </Modal>
  );
}

const Stat = ({ label, v }: { label: string; v: number }) => (
  <div className="stat">
    <div className="stat-v">{v}</div>
    <div className="stat-l">{label}</div>
  </div>
);

/** Turn store changes into sounds and world effects. */
function useSessionFx() {
  const shrineFor = useNav((s) => s.shrineFor);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const flags = useMemo(() => ({ shrineFor, reduced }), [shrineFor, reduced]);
  useEffect(
    () =>
      useApp.subscribe((state, prev) => {
        const a = prev.session;
        const b = state.session;
        if (!a || !b || a.id !== b.id || a === b) return;
        const undoing = state.future.length > prev.future.length;
        if (undoing) return;
        let gained = 0;
        for (const p of b.players) {
          const before = a.players.find((x) => x.id === p.id);
          if (before && p.souls > before.souls) gained += p.souls - before.souls;
        }
        if (gained > 0 && !flags.shrineFor) {
          sfx.coin(gained);
          fx({ type: 'souls', amount: Math.min(gained, 6) });
        }
        if (a.status === 'playing' && b.status === 'finished') {
          const winner = b.standings?.[0];
          const color = b.players.find((p) => p.id === winner)?.color ?? '#ffd070';
          setTimeout(() => {
            sfx.fanfare();
            fx({ type: 'win', color });
            fx({ type: 'flash', color, strength: 0.6 });
            fx({ type: 'shake', amount: 0.2 });
          }, 300);
        }
      }),
    [flags],
  );
}
