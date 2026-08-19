import React from 'react';
import ReactDOM from 'react-dom/client';
import { ScoreGauge } from '../ui/components/ScoreGauges';
import { VerdictStamp } from '../ui/components/VerdictStamp';
import { FindingCard } from '../ui/components/FindingCard';
import { CategoryFilterBar } from '../ui/components/CategoryFilterBar';

export function SidepanelApp() {
  return (
    <div className="flex flex-col min-h-screen p-4 font-sans bg-[#FBFBFA] dark:bg-[#121214] text-[#1C1917] dark:text-[#E7E5E4]">
      <header className="flex items-center justify-between pb-3 border-b border-[#E7E5E4] dark:border-[#27272A]">
        <div>
          <h1 className="text-lg font-bold font-display tracking-tight text-[#1C1917] dark:text-[#FAFAFA]">
            Fourches Caudines
          </h1>
          <p className="text-xs text-[#78716C] dark:text-[#A1A1AA]">
            Analyse critique et rigueur éditoriale
          </p>
        </div>
      </header>

      <main className="flex-1 py-4 space-y-6">
        <section className="p-4 rounded-xl bg-white dark:bg-[#18181B] border border-[#E7E5E4] dark:border-[#27272A] shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
              Évaluation Globale
            </h2>
            <VerdictStamp verdict="reviser_avant_publication" score={48} />
          </div>
          <div className="mt-4 flex justify-center">
            <ScoreGauge score={48} size={110} strokeWidth={8} showBandLabel={true} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
              Grille des constats
            </h3>
          </div>
          <CategoryFilterBar activeCategory="all" onSelectCategory={() => {}} counts={{ all: 1, sophisme: 1 }} />
          <div className="space-y-2.5">
            <FindingCard
              finding={{
                id: 'f-1',
                blockId: 'b-1',
                category: 'sophisme',
                severity: 3,
                label: 'Généralisation hâtive',
                explanation: "L'échantillon cité n'est pas représentatif de la population globale.",
                quote: "Tous les sondés estiment que la mesure est inefficace.",
                suggestion: "Préciser la taille de l'échantillon et les limites statistiques.",
                confidence: 0.95,
              }}
            />
          </div>
        </section>
      </main>

      <footer className="pt-3 border-t border-[#E7E5E4] dark:border-[#27272A] text-center text-xs text-[#A8A29E]">
        Analyse assistée par IA • Fourches Caudines MV3
      </footer>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <SidepanelApp />
    </React.StrictMode>
  );
}
