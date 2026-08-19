import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export interface TourStep {
  id: string;
  targetSelector?: string;
  title: string;
  badge?: string;
  content: string;
  methodologyTip?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  highlightPadding?: number;
  highlightRadius?: number;
  preventInteraction?: boolean;
}

export interface TourStorageOptions {
  storageKey?: string;
  storageVersion?: string;
  storageProvider?: Storage;
}

export interface OnboardingTourProps {
  steps?: TourStep[];
  isOpen?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
  onStepChange?: (stepIndex: number, step: TourStep) => void;
  storageKey?: string;
  storageVersion?: string;
  storageProvider?: Storage;
  autoStartIfUnseen?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
  zIndex?: number;
}

export const DEFAULT_STORAGE_KEY = 'fourches_caudines_onboarding_tour_v1';
export const DEFAULT_STORAGE_VERSION = '1.0.0';

export const DEFAULT_EDITORIAL_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome-overview',
    title: 'Bienvenue dans les Fourches Caudines',
    badge: 'Guide Éditorial',
    placement: 'center',
    content: 'Les Fourches Caudines analysent la rigueur argumentative, l’intégrité des sources et l’équilibre rhétorique de tout texte ou article web.',
    methodologyTip: 'Méthodologie : Nous combinons l’exigence de la presse de référence et l’analyse logique formelle pour évaluer la solidité d’un propos.',
  },
  {
    id: 'verdict-stamp',
    targetSelector: '[data-tour="verdict-stamp"]',
    title: 'Le Sceau & Verdict Global',
    badge: 'Verdict',
    placement: 'bottom',
    content: 'Le verdict synthétise instantanément l’état de l’écrit : « À Publier », « Corrections Mineures », « À Réviser » ou « À Bloquer ».',
    methodologyTip: 'Un verdict « À Bloquer » signale des failles rédhibitoires ou des sophismes majeurs nécessitant une refonte immédiate avant diffusion.',
  },
  {
    id: 'score-gauges',
    targetSelector: '[data-tour="score-gauges"]',
    title: 'Les Jauges & Indices de Rigueur',
    badge: 'Métrique 0-100',
    placement: 'bottom',
    content: 'Trois cadrans d’évaluation décomposent la qualité : Solidité Argumentative, Traçabilité des Faits, et Neutralité du Cadrage.',
    methodologyTip: 'Seuil de vigilance : Tout score sous 60/100 appelle une révision ciblée. Un score supérieur à 85/100 atteste d’une démonstration robuste.',
  },
  {
    id: 'filter-bar',
    targetSelector: '[data-tour="category-filters"]',
    title: 'Filtres & Taxonomie des Failles',
    badge: 'Taxonomie',
    placement: 'bottom',
    content: 'Filtrez instantanément les anomalies par typologie : Sophismes, Affirmations Non Étayées, Extrapolations, Sources Absentes et Cadrages Biaisés.',
    methodologyTip: 'Cliquez sur les compteurs pour isoler les points d’attention majeurs et prioriser vos retouches éditoriales.',
  },
  {
    id: 'finding-cards',
    targetSelector: '[data-tour="finding-card"]',
    title: 'Fiches Critiques & Conduite de Relecture',
    badge: 'Analyse Détaillée',
    placement: 'top',
    content: 'Chaque carte détaille un passage problématique, explique la faille logique et propose une formulation de remplacement prête à l’emploi.',
    methodologyTip: 'Trait de conduite : Le survol d’une fiche relie visuellement la critique au passage surligné dans l’article d’origine.',
  },
  {
    id: 'severity-levels',
    targetSelector: '[data-tour="severity-badges"]',
    title: 'Niveaux de Gravité & Priorisation',
    badge: 'Gravité',
    placement: 'top',
    content: 'Les badges Rouge (Critique), Ambre (Majeur) et Bleu (Mineur) hiérarchisent les interventions du rédacteur en chef.',
    methodologyTip: 'Conseil de rédaction : Traitez d’abord les anomalies critiques pour assainir la thèse maîtresse avant d’ajuster les nuances lexicales.',
  },
  {
    id: 'export-canvas',
    targetSelector: '[data-tour="export-actions"]',
    title: 'Export & Partage du Rapport',
    badge: 'Export Retina',
    placement: 'top',
    content: 'Générez en un clic un carton de synthèse haute définition (2x Retina) ou copiez le plan de révision pour le partager avec vos pairs.',
    methodologyTip: 'Le carton certifié résume les métriques clés pour vos revues de pairs ou votre communication publique.',
  },
];

export function getTourCompletionStatus(storageKey = DEFAULT_STORAGE_KEY, storageProvider = typeof window !== 'undefined' ? window.localStorage : ({} as Storage)) {
  try {
    if (!storageProvider || typeof storageProvider.getItem !== 'function') return { completed: false };
    const data = storageProvider.getItem(storageKey);
    if (!data) return { completed: false };
    const parsed = JSON.parse(data);
    return { completed: !!parsed.completed, version: parsed.version, completedAt: parsed.completedAt };
  } catch { return { completed: false }; }
}

export function setTourCompletionStatus(completed: boolean, storageKey = DEFAULT_STORAGE_KEY, storageVersion = DEFAULT_STORAGE_VERSION, storageProvider = typeof window !== 'undefined' ? window.localStorage : ({} as Storage)) {
  try {
    if (!storageProvider || typeof storageProvider.setItem !== 'function') return;
    if (completed) {
      storageProvider.setItem(storageKey, JSON.stringify({ completed: true, version: storageVersion, completedAt: new Date().toISOString() }));
    } else {
      storageProvider.removeItem(storageKey);
    }
  } catch (err) { console.warn('Failed to save tour completion status to storage', err); }
}

export function resetTourCompletionStatus(storageKey = DEFAULT_STORAGE_KEY, storageProvider = typeof window !== 'undefined' ? window.localStorage : ({} as Storage)) {
  setTourCompletionStatus(false, storageKey, undefined, storageProvider);
}

export function computeTourPosition(targetElement: HTMLElement | null, placement: 'top' | 'bottom' | 'left' | 'right' | 'center' = 'bottom', padding = 8) {
  if (!targetElement || placement === 'center' || typeof window === 'undefined') {
    return { top: typeof window !== 'undefined' ? window.innerHeight / 2 : 300, left: typeof window !== 'undefined' ? window.innerWidth / 2 : 400, placement: 'center' as const, targetRect: null };
  }
  const rect = targetElement.getBoundingClientRect();
  return { top: rect.bottom + 12, left: rect.left + rect.width / 2 - 180, placement, targetRect: rect };
}

export const OnboardingTour: React.FC<OnboardingTourProps> = (props) => {
  return <div data-testid="onboarding-tour-root" />;
};
