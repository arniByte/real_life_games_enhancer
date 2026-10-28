import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/cormorant-sc/600.css';
import '@fontsource/cormorant-sc/700.css';
import './styles/global.css';
import './styles/components.css';
import './styles/screens.css';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
