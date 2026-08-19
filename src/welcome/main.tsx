import React from 'react';
import ReactDOM from 'react-dom/client';

export function WelcomeApp() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-[#FBFBFA] dark:bg-[#121214] text-[#1C1917] dark:text-[#E7E5E4]">
      <div className="max-w-xl w-full p-8 rounded-2xl bg-white dark:bg-[#18181B] border border-[#E7E5E4] dark:border-[#27272A] shadow-lg text-center space-y-6">
        <h1 className="text-3xl font-bold font-display text-[#1C1917] dark:text-[#FAFAFA]">
          Squiggle
        </h1>
        <p className="text-sm leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
          Bienvenue dans votre atelier de vérification éditoriale et d'analyse critique pour Chrome et Firefox MV3.
        </p>
        <div className="p-4 rounded-lg bg-[#F5F5F4] dark:bg-[#27272A] text-left text-xs space-y-2">
          <p className="font-semibold text-[#1C1917] dark:text-[#FAFAFA]">Fonctionnalités prêtes :</p>
          <ul className="list-disc list-inside text-[#78716C] dark:text-[#D4D4D8] space-y-1">
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
