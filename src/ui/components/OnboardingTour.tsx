import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';

import { SCORE_DOMAINS, type ScoreBand } from '../../engine/types';
import { determineScoreBand, getScoreBandLabel } from '../../engine/scoring';
import { CATEGORY_LABELS_FR } from '../../adapters/findingAdapters';

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

/**
 * The grid the reader is shown, taken from the engine that applies it.
 *
 * Naming the domains in prose is how this copy came to announce three fictional
 * ones. Anything the visit says about the grid or the bands is derived from the
 * scoring code instead, so the tour cannot describe a product that no longer
 * exists.
 */
const WEIGHTED_DOMAINS = Object.values(SCORE_DOMAINS)
  .map((domain) => `${domain.label} (${domain.weight})`)
  .join(', ');

const SORTABLE_CATEGORIES = Object.values(CATEGORY_LABELS_FR).join(', ');

/** The bands are monotonic, so the first score to land in one is its floor. */
function bandFloor(band: ScoreBand): number {
  for (let score = 0; score <= 100; score += 1) {
    if (determineScoreBand(score) === band) return score;
  }
  return 0;
}

const SOLID_FLOOR = bandFloor('solide');
const FRAGILE_FLOOR = bandFloor('fragile');

/**
 * The visit as a reader meets it, in the order the panel itself reads.
 *
 * The opening steps carry no anchor on purpose: on a first run there is no
 * report, and those are the steps that have to explain what the extension does
 * and why it asks for a key. Everything anchored describes a result, and is
 * shown only once that result is on screen.
 */
export const DEFAULT_EDITORIAL_TOUR_STEPS: TourStep[] = [
  {
    id: 'reading-this-page',
    title: 'Ce que Squiggle regarde pour vous',
    badge: 'Lecture critique',
    placement: 'center',
    content: 'Squiggle lit l’article ouvert dans l’onglet actif et le passe à la grille des Fourches Caudines : la solidité des faits avancés, la tenue du raisonnement, et les tournures qui orientent votre jugement sans rien démontrer.',
    methodologyTip: 'La méthode porte sur le texte publié, jamais sur les intentions qu’on pourrait lui prêter. Chaque remarque renvoie à un passage précis, que vous pouvez relire et juger par vous-même.',
  },
  {
    id: 'your-own-key',
    targetSelector: '[data-tour="settings"]',
    title: 'L’analyse tourne chez votre fournisseur',
    badge: 'Votre clé',
    placement: 'bottom',
    content: 'Squiggle n’héberge aucun service. Vous renseignez ici votre propre clé API, et l’article est analysé par le modèle de votre choix, appelé depuis votre navigateur. Sans clé, aucune analyse n’est possible.',
    methodologyTip: 'Le modèle qui a rendu le verdict est indiqué en bas du panneau : vous savez toujours d’où vient ce que vous lisez.',
  },
  {
    id: 'run-analysis',
    targetSelector: '[data-tour="run-analysis"]',
    title: 'Analyser l’article que vous avez sous les yeux',
    badge: 'Sur la page ouverte',
    placement: 'bottom',
    content: 'Le texte est extrait de la page en cours, audité, puis les faits qu’il avance sont confrontés à des sources consultées en ligne. Les passages en cause sont surlignés dans l’article lui-même.',
    methodologyTip: 'La recherche vient après la lecture, jamais avant : l’audit dit d’abord ce qu’il lit dans le texte, et les sources viennent ensuite le confirmer ou le démentir.',
  },
  {
    id: 'global-score',
    targetSelector: '[data-tour="score-gauges"]',
    title: 'Le verdict d’ensemble',
    badge: 'Score sur 100',
    placement: 'bottom',
    content: `À partir de ${SOLID_FLOOR}/100, l’article est présenté comme « ${getScoreBandLabel('solide').title} ». En dessous de ${FRAGILE_FLOOR}/100, comme « ${getScoreBandLabel('problematique').title} ».`,
    methodologyTip: 'Le score n’est pas une note donnée à côté des constats : chaque constat retire une part des points du domaine qu’il concerne, d’autant plus grande qu’il est grave. Un défaut visible dans ce panneau coûte donc forcément des points.',
  },
  {
    id: 'verification-record',
    targetSelector: '[data-tour="research-disclosure"]',
    title: 'Ce qui a été vérifié, et où',
    badge: 'Sources',
    placement: 'bottom',
    content: 'Les affirmations vérifiables sont confrontées à des sources listées ici avec leur lien, que vous pouvez ouvrir. Quand les sources donnent raison à l’article, le constat est retiré et vous le voyez aussi.',
    methodologyTip: 'Une vérification qui n’a pas pu avoir lieu est annoncée comme telle, plutôt que remplacée par une certitude de façade.',
  },
  {
    id: 'weighted-domains',
    targetSelector: '[data-tour="domain-scores"]',
    title: 'Les domaines et leur poids',
    badge: 'Pondération',
    placement: 'top',
    content: `Les 100 points se répartissent sur des domaines pondérés selon ce qu’ils engagent pour vous : ${WEIGHTED_DOMAINS}. Dépliez un domaine pour voir ce qui lui a été retenu.`,
    methodologyTip: 'La pondération inscrit une hiérarchie dans le calcul : un fait faux pèse plus lourd qu’une faute d’accord, et cela ne dépend pas de l’humeur du moment.',
  },
  {
    id: 'sort-findings',
    targetSelector: '[data-tour="category-filters"]',
    title: 'Trier les constats par nature',
    badge: 'Taxonomie',
    placement: 'bottom',
    content: `Chaque compteur isole une nature de constat : ${SORTABLE_CATEGORIES}. Le dernier n’est pas un reproche : l’audit relève aussi ce que l’article fait correctement.`,
    methodologyTip: 'Une affirmation non étayée et un cadrage orienté ne se lisent pas de la même manière : l’une manque de preuve, l’autre en donne l’impression sans en apporter.',
  },
  {
    id: 'finding-cards',
    targetSelector: '[data-tour="finding-card"]',
    title: 'Chaque constat cite le passage visé',
    badge: 'Analyse détaillée',
    placement: 'top',
    content: 'Une fiche par constat : le passage exact tel qu’il est écrit, ce qui lui est reproché, sa gravité (Critique, Majeur ou Mineur) et l’état de vérification de l’affirmation citée. Survolez une fiche pour retrouver le passage surligné dans la page.',
    methodologyTip: 'L’état de vérification décrit toujours la phrase de l’article, pas l’objection qui lui est faite. Une affirmation que le texte ne source pas n’est pas fausse pour autant, et se distingue de celle que les sources mettent en doute.',
  },
];

/**
 * The steps that can actually show something, given which anchors are on screen.
 *
 * Most of the visit describes a report, and on a first run there is none, so
 * every anchored step would darken the panel and highlight nothing - useless at
 * the one moment the visit matters most. A step is kept when it stands on its
 * own prose, or when the element it points at exists.
 */
export function selectAvailableSteps(
  steps: TourStep[],
  isAnchorPresent: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((step) => !step.targetSelector || isAnchorPresent(step.targetSelector));
}

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

  // The anchors belong to the host's markup, which React only puts in the
  // document when it commits: reading them while rendering finds nothing at all
  // on a first mount, and would throw away the very steps that matter then. A
  // layout effect resolves them once the DOM exists and before the browser
  // paints, so the reader never sees the unfiltered list, and resolving only as
  // the visit opens keeps the list from shifting under them mid-walk.
  const [resolvedSteps, setResolvedSteps] = useState<TourStep[] | null>(null);

  useLayoutEffect(() => {
    if (!visible || typeof document === 'undefined') {
      setResolvedSteps(null);
      return;
    }
    setResolvedSteps(
      selectAvailableSteps(steps, (selector) => document.querySelector(selector) !== null),
    );
  }, [visible, steps]);

  const activeSteps = resolvedSteps ?? steps;

  const step = activeSteps[stepIndex];
  const isLast = stepIndex >= activeSteps.length - 1;

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
        else setStepIndex((i) => Math.min(i + 1, activeSteps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, isLast, activeSteps.length, finish]);

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
            {activeSteps.map((s, i) => (
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
