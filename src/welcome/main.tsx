import React from 'react';
import ReactDOM from 'react-dom/client';

import { SquiggleBadge } from '../ui/components/SquiggleBadge';

export function WelcomeApp() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-ground text-ink">
      <div className="max-w-xl w-full p-8 rounded-2xl bg-panel border border-line shadow-lg text-center space-y-6">
        <SquiggleBadge className="mx-auto h-14 w-14" />
        <h1 className="text-3xl font-bold font-display text-ink">
          Squiggle
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Bienvenue dans votre atelier de vérification éditoriale et d'analyse critique pour Chrome et Firefox MV3.
        </p>
        <div className="p-4 rounded-lg bg-panel-muted text-left text-xs space-y-2">
          <p className="font-semibold text-ink">Fonctionnalités prêtes :</p>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li>Analyse logique et factuelle avec LLM BYOK sécurisé</li>
            <li>Surlignage en page dans un Shadow DOM isolé</li>
            <li>Panneau latéral avec jauges, constats et export Canvas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <WelcomeApp />
    </React.StrictMode>
  );
}
