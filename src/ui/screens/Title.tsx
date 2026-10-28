import { useEffect } from 'react';
import { motion } from '../components/kit';
import { useNav } from '../nav';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';

export function Title() {
  const go = useNav((s) => s.go);

  useEffect(() => {
    const wake = () => {
      sfx.unlock();
      sfx.start();
      sfx.setDrone('hub');
      fx({ type: 'flash', color: '#b06aff', strength: 0.7 });
      fx({ type: 'hub.mode', mode: 'hub' });
      go('hub');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') wake();
    };
    window.addEventListener('keydown', onKey);
    const el = document.getElementById('title-hit');
    el?.addEventListener('pointerup', wake);
    return () => {
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('pointerup', wake);
    };
  }, [go]);

  return (
    <div id="title-hit" className="title-screen">
      <motion.div className="title-brand" initial={{ opacity: 0, letterSpacing: '0.8em' }} animate={{ opacity: 1, letterSpacing: '0.35em' }} transition={{ duration: 2.2 }}>
        ✦ ARNIBYTE ПРЕДСТАВЛЯЕТ ✦
      </motion.div>
      <motion.h1
        className="title-logo"
        initial={{ opacity: 0, scale: 1.25, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.6, delay: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className="title-l1">Real Life</span>
        <span className="title-l2">Games Enhancer</span>
      </motion.h1>
      <motion.div className="title-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1 }}>
        усилитель настоящих игр · души · дары · проклятия
      </motion.div>
      <motion.div className="title-press" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
        — Нажми, чтобы пробудить —
      </motion.div>
      <div className="title-foot">v0.1 · дартс · шахматы · дурак · пинг-понг · любая игра</div>
    </div>
  );
}
