import { useEffect } from 'react';
import { useNav } from '../nav';
import { fx } from '../../three';
import { sfx } from '../../audio/sfx';
import { PixelText, usePx } from '../pixel/PixelText';

export function Title() {
  const go = useNav((s) => s.go);
  const showOsd = useNav((s) => s.showOsd);
  const px = usePx();

  useEffect(() => {
    const wake = () => {
      sfx.unlock();
      sfx.start();
      sfx.setDrone('hub');
      showOsd('play');
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
  }, [go, showOsd]);

  const big = px >= 3;
  return (
    <div id="title-hit" className="title-screen">
      <div className="title-brand dither-in slow">✦ ARNIBYTE ПРЕДСТАВЛЯЕТ ✦</div>
      <div className="title-logo dither-in slow">
        <PixelText text="REAL LIFE" size={big ? 36 : 28} tone="bone" align="center" />
        <PixelText text="GAMES ENHANCER" size={big ? 24 : 17} tone="gold" align="center" />
      </div>
      <div className="title-sub">усилитель настоящих игр · души · дары · проклятия</div>
      <div className="title-press">— нажми, чтобы пробудить —</div>
      <div className="title-foot">v0.2 · дартс · шахматы · дурак · пинг-понг · любая игра</div>
    </div>
  );
}
