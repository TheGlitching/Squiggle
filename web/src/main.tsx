import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App, rendersReaderState } from './App';
import { countCampaign } from './count';
import './index.css';

countCampaign();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// A public page arrives rendered (see `prerender` in vite.config.ts): the app takes over
// its nodes rather than paint them again, so the first paint is the page's largest one.
// A page whose first render is the reader's own is rendered afresh over the build's copy,
// as is any other page, from an empty root.
if (root.hasChildNodes() && !rendersReaderState(location.pathname)) hydrateRoot(root, app);
else createRoot(root).render(app);

// The installed app's shell (manifest.webmanifest). Production only: a dev
// server has no built shell to cache. This script runs after the first paint
// (see `firstPaintReady` in vite.config.ts), often once the page has loaded.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
