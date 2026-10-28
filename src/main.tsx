import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/tiny5/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/cormorant-sc/700.css';
import '@fontsource/ruslan-display/400.css';
import '@fontsource/vt323/400.css';
import './styles/global.css';
import './styles/components.css';
import './styles/screens.css';
import { App } from './App';
import { applyTheme } from './ui/pixel/theme';
import { registerSW } from 'virtual:pwa-register';

// Pixel-art frames must exist before the first paint.
applyTheme();
window.addEventListener('resize', applyTheme);

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
