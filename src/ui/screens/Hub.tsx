import { useEffect, useRef } from 'react';
import { AnimatePresence, Btn, PixelIcon, motion } from '../components/kit';
import { useNav } from '../nav';
import { useApp } from '../../core/store';
import { GAME_META, GAME_ORDER } from '../../games/meta';
import { GAME_LOGIC } from '../../games/logic';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';
import { Heading, WorldTitle } from '../pixel/Type';

export function Hub() {
  const { hubIndex, setHub, setup, open, go, confirm } = useNav();
  const session = useApp((s) => s.session);
  const closeSession = useApp((s) => s.closeSession);
  const meta = GAME_META[GAME_ORDER[hubIndex]];
  const entering = useRef(false);

  const select = (i: number) => {
    const n = GAME_ORDER.length;
    const next = (i + n) % n;
    setHub(next);
    fx({ type: 'hub.select', index: next });
    sfx.tick();
  };

  const enter = () => {
    if (entering.current) return;
    entering.current = true;
    sfx.whoosh();
    fx({ type: 'hub.mode', mode: 'enter' });
    setTimeout(() => {
      entering.current = false;
      setup(GAME_ORDER[hubIndex]);
    }, 750);
  };

  useEffect(() => {
    fx({ type: 'hub.select', index: hubIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useNav.getState().modal) return;
      if (e.key === 'ArrowLeft') select(hubIndex - 1);
      if (e.key === 'ArrowRight') select(hubIndex + 1);
      if (e.key === 'Enter') enter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe to rotate the ring.
  const drag = useRef<{ x: number; t: number } | null>(null);

  return (
    <div
      className="hub"
      onPointerDown={(e) => (drag.current = { x: e.clientX, t: Date.now() })}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 50 && Date.now() - d.t < 600) select(hubIndex + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="hub-top">
        <div className="row" style={{ gap: 'calc(var(--pxn) * 3px)' }}>
          <Heading>RLGE</Heading>
          <span className="label hide-sm">Перекрёсток миров</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Btn size="small" onClick={() => open('roster')}>
            <PixelIcon id="mask" size={16} /> <span className="hide-sm">Игроки</span>
          </Btn>
          <Btn size="small" onClick={() => open('codex', 'about')}>
            <PixelIcon id="scroll" size={16} /> <span className="hide-sm">Кодекс</span>
          </Btn>
          <Btn size="small" onClick={() => open('chronicle')}>
            <PixelIcon id="crown" size={16} /> <span className="hide-sm">Летопись</span>
          </Btn>
          <Btn
            size="small"
            icon
            className="hide-sm"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})}
            aria-label="Полный экран"
            title="Полный экран"
          >
            ⛶
          </Btn>
          <Btn size="small" icon onClick={() => open('settings')} aria-label="Настройки">
            ⚙
          </Btn>
        </div>
      </div>

      {session && session.status === 'playing' && (
        <motion.div className="panel hub-resume dither-in" initial={{ y: -12 }} animate={{ y: 0 }}>
          <div className="grow col" style={{ gap: 'calc(var(--pxn) * 1px)' }}>
            <div className="field-label">● Незавершённая запись</div>
            <div className="hub-resume-title" style={{ color: GAME_META[session.gameId].accent }}>
              {GAME_META[session.gameId].title}
            </div>
            <div className="label">{GAME_LOGIC[session.gameId].status(session)}</div>
            <div className="label faint">{session.players.map((p) => p.name).join(' · ')}</div>
          </div>
          <Btn variant="gold" onClick={() => { sfx.whoosh(); go('play'); }}>Продолжить</Btn>
          <Btn variant="ghost" size="small" onClick={() => confirm('Бросить незавершённую игру? Счёт и перки пропадут.', closeSession, 'Бросить')} aria-label="Бросить игру">✕</Btn>
        </motion.div>
      )}

      <div className="grow" />

      <div className="hub-bottom">
        <Btn className="hub-arrow" variant="ghost" onClick={() => select(hubIndex - 1)} aria-label="Предыдущий мир">
          ◀
        </Btn>
        <AnimatePresence mode="wait">
          <motion.div
            key={meta.id}
            className="hub-info dither-in"
            initial={{ y: 8 }}
            animate={{ y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ ['--accent' as string]: meta.accent }}
          >
            <div className="hub-game">
              <PixelIcon id={meta.icon} color={meta.accent} size={24} /> {meta.title}
              <span className="faint">
                · {meta.minPlayers === meta.maxPlayers ? `${meta.minPlayers} игрока` : `${meta.minPlayers}–${meta.maxPlayers} игроков`}
              </span>
            </div>
            <WorldTitle>{meta.world}</WorldTitle>
            <div className="hub-tagline">{meta.tagline}</div>
          </motion.div>
        </AnimatePresence>
        <Btn className="hub-arrow" variant="ghost" onClick={() => select(hubIndex + 1)} aria-label="Следующий мир">
          ▶
        </Btn>
      </div>
      <div className="hub-dots">
        {GAME_ORDER.map((id, i) => (
          <button key={id} type="button" className={`hub-dot ${i === hubIndex ? 'on' : ''}`} onClick={() => select(i)} aria-label={GAME_META[id].title} style={{ ['--accent' as string]: GAME_META[id].accent }} />
        ))}
      </div>
      <div className="hub-enter">
        <Btn variant="primary" size="big" onClick={enter} className="menu-item">
          Войти в мир
        </Btn>
      </div>
    </div>
  );
}
