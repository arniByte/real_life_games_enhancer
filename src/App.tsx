import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from './ui/components/kit';
import { useNav } from './ui/nav';
import { useApp } from './core/store';
import { fx, getEngine, goScene, mountEngine, type SceneId } from './three';
import { sfx } from './audio/sfx';
import { Title } from './ui/screens/Title';
import { Hub } from './ui/screens/Hub';
import { Setup } from './ui/screens/Setup';
import { Play } from './ui/screens/Play';
import { Modals } from './ui/screens/Modals';
import { Vhs } from './ui/pixel/Vhs';
import { PixelText } from './ui/pixel/PixelText';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screen = useNav((s) => s.screen);
  const setupGame = useNav((s) => s.setupGame);
  const shrineFor = useNav((s) => s.shrineFor);
  const hubIndex = useNav((s) => s.hubIndex);
  const banner = useNav((s) => s.banner);
  const sessionGame = useApp((s) => s.session?.gameId);
  const settings = useApp((s) => s.settings);

  useEffect(() => {
    const engine = mountEngine(canvasRef.current!);
    engine.configure(useApp.getState().settings);
    engine.go('hub');
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    getEngine()?.configure({ resolution: settings.resolution, jitter: settings.jitter, crt: settings.crt, reducedMotion: settings.reducedMotion });
    sfx.setVolume(settings.volume);
    sfx.setMusic(settings.music);
  }, [settings]);

  // Scanlines follow the 3D render's pixel rows exactly.
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rows = Math.max(64, Math.round(h * (settings.resolution / Math.min(w, h))));
      document.documentElement.style.setProperty('--scan', `${h / rows}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [settings.resolution]);

  // Keep the scene's focus visible next to the UI panels.
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const portrait = w / h < 1;
      const docked = w >= 1100 && w / h >= 4 / 3;
      let x = 0;
      let y = 0;
      // Centre of the free band between UI panels → NDC shift (projection shift is the negated NDC).
      const band = (top: number, bottom: number) => -(1 - (top + bottom) / h);
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      if (shrineFor) {
        const head = rect('.shrine-head');
        const menu = rect('.shrine-menu');
        y = head && menu ? band(head.bottom, menu.top) : portrait ? -0.45 : -0.18;
      } else if (screen === 'play') {
        const players = rect('.players');
        const consoleBox = rect('.play-console');
        if (docked && consoleBox) x = 1 - consoleBox.left / w;
        else if (players && consoleBox) y = band(players.bottom, consoleBox.top);
        else y = portrait ? -0.4 : -0.3;
      } else if (screen === 'setup') {
        const panel = rect('.setup-panel');
        if (portrait) y = -0.2;
        else if (panel) x = -(panel.right / w);
      }
      getEngine()?.setFrame(Math.max(-0.7, Math.min(0.7, x)), Math.max(-0.7, Math.min(0.7, y)));
    };
    update();
    const timer = setInterval(update, 400);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', update);
    };
  }, [screen, shrineFor]);

  // Keep the 3D world in sync with where the player is.
  useEffect(() => {
    let id: SceneId = 'hub';
    if (shrineFor) id = 'shrine';
    else if (screen === 'setup' && setupGame) id = setupGame;
    else if (screen === 'play' && sessionGame) id = sessionGame;
    const engine = getEngine();
    if (!engine) return;
    const changed = engine.sceneId !== id;
    goScene(id);
    sfx.setDrone(id);
    if (id === 'hub' && screen === 'hub' && changed) {
      fx({ type: 'hub.mode', mode: 'hub' });
      fx({ type: 'hub.select', index: hubIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, setupGame, shrineFor, sessionGame]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      <div className={`ui-root ${settings.reducedMotion ? 'reduced' : ''}`}>
        <div key={screen} className="screen dither-in slow">
          {screen === 'title' && <Title />}
          {screen === 'hub' && <Hub />}
          {screen === 'setup' && <Setup />}
          {screen === 'play' && <Play />}
        </div>
        <Modals />
        <div id="portal" />
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.id}
              className="banner"
              initial={{ scale: 1.6 }}
              animate={{ scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            >
              <div className="dither-in">
                <PixelText text={banner.text} size={40} tone={banner.color} align="center" />
              </div>
              {banner.sub && <div className="banner-sub dither-in">{banner.sub}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Vhs crt={settings.crt} reduced={settings.reducedMotion} />
    </>
  );
}
