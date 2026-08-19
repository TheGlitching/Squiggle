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

export const DEFAULT_STORAGE_KEY = 'squiggle_onboarding_tour_v1';
export const DEFAULT_STORAGE_VERSION = '1.0.0';

export const DEFAULT_EDITORIAL_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome-overview',
    title: 'Bienvenue dans Squiggle',
    badge: 'Guide Éditorial',
    placement: 'center',
    content: 'Squiggle applique la grille des Fourches Caudines pour évaluer la rigueur argumentative, l’intégrité des sources et l’équilibre rhétorique de tout texte ou article web.',
    methodologyTip: 'Méthodologie : Nous combinons l’exigence de la presse de référence et l’analyse logique formelle pour évaluer la solidité d’un propos.',
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
    methodologyTip: 'Cliquez sur les compteurs pour isoler les points d’attention majeurs et concentrer votre lecture sur les points les plus sensibles.',
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

/** Distance kept between the highlighted element and the card. */
const CARD_GAP = 12;
/** Smallest margin the card keeps from a viewport edge. */
const VIEWPORT_MARGIN = 12;

export interface TourViewportMetrics {
  viewportHeight: number;
  cardHeight: number;
}

/**
 * Anchors the card near its target without ever pushing it off screen.
 *
 * The card's measured height is an input rather than an assumption. The panel
 * is narrow, so each step's prose wraps to a height that is only known once
 * rendered; assuming a height is what pushed the footer - and with it the only
 * control that advances the visit - below the fold on the longer steps.
 *
 * A step's declared side is a preference, not a guarantee: it is honoured when
 * the card fits there, the opposite side is taken when it does not, and the
 * final clamp wins over both, because a card that stays on screen matters more
 * than one that sits where it asked to.
 *
 * Only the vertical anchor is consumed: the card spans the panel width, so
 * `left` reports the target's centre for callers that draw a pointer at it.
 */
export function computeTourPosition(
  targetElement: HTMLElement | null,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center' = 'bottom',
  _padding = 8,
  metrics: Partial<TourViewportMetrics> = {},
) {
  const viewportHeight =
    metrics.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 600);
  const cardHeight = metrics.cardHeight ?? 0;

  if (!targetElement || placement === 'center' || typeof window === 'undefined') {
    return {
      top: viewportHeight / 2,
      left: typeof window !== 'undefined' ? window.innerWidth / 2 : 400,
      placement: 'center' as const,
      targetRect: null,
    };
  }

  const rect = targetElement.getBoundingClientRect();
  const above = rect.top - CARD_GAP - cardHeight;
  const below = rect.bottom + CARD_GAP;
  const fitsAbove = above >= VIEWPORT_MARGIN;
  const fitsBelow = below + cardHeight + VIEWPORT_MARGIN <= viewportHeight;

  const preferred = placement === 'top' ? (fitsAbove ? above : below) : fitsBelow ? below : above;
  const lowestTop = Math.max(VIEWPORT_MARGIN, viewportHeight - cardHeight - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(preferred, VIEWPORT_MARGIN), lowestTop);

  return { top, left: rect.left + rect.width / 2, placement, targetRect: rect };
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps = DEFAULT_EDITORIAL_TOUR_STEPS,
  isOpen,
  onComplete,
  onSkip,
  onStepChange,
  storageKey = DEFAULT_STORAGE_KEY,
  storageVersion = DEFAULT_STORAGE_VERSION,
  storageProvider,
  autoStartIfUnseen = false,
  theme = 'light',
  className,
  zIndex = 50,
}) => {
  const store = storageProvider ?? (typeof window !== 'undefined' ? window.localStorage : undefined);

  // `isOpen` is the controlled door; `autoStarted` is the uncontrolled one, so a
  // first-run tour can open itself without the host tracking seen-state.
  const [autoStarted, setAutoStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(() => computeTourPosition(null, 'center'));
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoStartIfUnseen || isOpen !== undefined) return;
    const { completed } = getTourCompletionStatus(storageKey, store as Storage);
    if (!completed) setAutoStarted(true);
  }, [autoStartIfUnseen, isOpen, storageKey, store]);

  const visible = isOpen ?? autoStarted;
  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  // Re-anchor on step change and whenever the layout moves under us.
  useEffect(() => {
    if (!visible || !step) return;

    const reposition = () => {
      const target = step.targetSelector
        ? (document.querySelector(step.targetSelector) as HTMLElement | null)
        : null;
      setPosition(
        computeTourPosition(target, step.placement ?? 'bottom', step.highlightPadding ?? 8, {
          cardHeight: cardRef.current?.offsetHeight ?? 0,
        }),
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    // The first pass measures the card before this step's prose has wrapped, so
    // it reads the previous step's height. Watching the card re-anchors it once
    // the real height settles, which is what keeps the footer reachable.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null;
    if (cardRef.current && observer) observer.observe(cardRef.current);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer?.disconnect();
    };
  }, [visible, step]);

  useEffect(() => {
    if (visible && step) onStepChange?.(stepIndex, step);
  }, [visible, step, stepIndex, onStepChange]);

  const finish = useCallback(
    (skipped: boolean) => {
      setTourCompletionStatus(true, storageKey, storageVersion, store as Storage);
      setAutoStarted(false);
      setStepIndex(0);
      if (skipped) onSkip?.();
      else onComplete?.();
    },
    [onComplete, onSkip, storageKey, storageVersion, store]
  );

  // Keyboard control: arrows advance, Escape skips.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(true);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) finish(false);
        else setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, isLast, steps.length, finish]);

  const highlightBox = useMemo(() => {
    const rect = position.targetRect;
    if (!rect) return null;
    const pad = step?.highlightPadding ?? 8;
    return {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      radius: step?.highlightRadius ?? 12,
    };
  }, [position.targetRect, step?.highlightPadding, step?.highlightRadius]);

  if (!visible || !step) return null;

  const dark = theme === 'dark';
  const surface = dark ? '#18181B' : '#FFFFFF';
  const border = dark ? '#3F3F46' : '#E7E5E4';
  const primaryText = dark ? '#FAFAFA' : '#1C1917';
  const mutedText = dark ? '#A1A1AA' : '#78716C';

  const centered = !highlightBox;

  return (
    <div
      data-testid="onboarding-tour-root"
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      style={{ position: 'fixed', inset: 0, zIndex }}
    >
      {/* Scrim with a punched-out ring around the anchored element. */}
      <div
        onClick={() => finish(true)}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}
      />
      {highlightBox && (
        <div
          style={{
            position: 'absolute',
            top: highlightBox.top,
            left: highlightBox.left,
            width: highlightBox.width,
            height: highlightBox.height,
            borderRadius: highlightBox.radius,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            border: `2px solid ${dark ? '#FAFAFA' : '#FFFFFF'}`,
            pointerEvents: step.preventInteraction ? 'auto' : 'none',
          }}
        />
      )}

      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          top: centered ? '50%' : position.top,
          left: centered ? '50%' : 16,
          right: centered ? undefined : 16,
          transform: centered ? 'translate(-50%, -50%)' : undefined,
          width: centered ? 'min(20rem, calc(100vw - 2rem))' : undefined,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
          // A step whose prose is taller than the panel scrolls its own text
          // rather than growing past the viewport, so the controls below stay
          // on screen and reachable at every step.
          maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Only the prose scrolls, so the controls below it never leave the screen. */}
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {step.badge && (
            <span
              style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: mutedText,
                marginBottom: 6,
              }}
            >
              {step.badge}
            </span>
          )}
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: primaryText }}>
            {step.title}
          </h3>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: mutedText }}>
            {step.content}
          </p>
          {step.methodologyTip && (
            <p
              style={{
                margin: '10px 0 0',
                padding: '8px 10px',
                borderRadius: 10,
                background: dark ? '#27272A' : '#F5F5F4',
                fontSize: 11.5,
                lineHeight: 1.5,
                color: mutedText,
              }}
            >
              {step.methodologyTip}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 14,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                style={{
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === stepIndex ? primaryText : border,
                  transition: 'width 180ms ease',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
                style={{
                  border: `1px solid ${border}`,
                  background: 'transparent',
                  color: primaryText,
                  borderRadius: 10,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                Retour
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish(false) : setStepIndex((i) => i + 1))}
              style={{
                border: 'none',
                background: primaryText,
                color: dark ? '#18181B' : '#FFFFFF',
                borderRadius: 10,
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isLast ? 'Commencer' : 'Suivant'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => finish(true)}
          style={{
            marginTop: 10,
            width: '100%',
            border: 'none',
            background: 'transparent',
            color: mutedText,
            fontSize: 11.5,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Passer la visite
        </button>
      </div>
    </div>
  );
};
