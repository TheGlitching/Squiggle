import { describe, it, expect } from 'vitest';
import { darkTheme } from '../src/ui/tokens/colors';
import { TYPOGRAPHY, GOOGLE_FONTS_URL, typographyTokens } from '../src/ui/tokens/typography';
import { formatPoints, getScoreBandColor } from '../src/ui/components/ScoreGauges';
import { determineScoreBand } from '@squiggle/shared';
import { SCORE_DOMAINS, ScoreDomainKey } from '@squiggle/shared';
import { VERIFICATION_STYLES } from '../src/ui/components/VerificationBadge';

/** WCAG relative luminance, for the one contrast promise the design system makes. */
function relativeLuminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Editorial Design System & Tokens', () => {
  // The extension is dark-only and colour means severity only: there is one
  // theme, and it exposes four severity tones and no category hues at all.
  it('defines the single dark theme with severity as the only colour channel', () => {
    expect(darkTheme.bg).toBe('#0a0a0b');
    expect(darkTheme.accent).toBe('#e0483f');

    expect(darkTheme.severity.critical.fill).toBe('#dc2626');
    expect(darkTheme.severity.warning.fill).toBe('#d97706');
    expect(darkTheme.severity.info.fill).toBe('#2563eb');
    expect(darkTheme.severity.positive.fill).toBe('#059669');

    // The six historical category hues are gone.
    for (const gone of ['sophisme', 'unsupported', 'overreach', 'sourceAbsent', 'framing', 'strength']) {
      expect(darkTheme).not.toHaveProperty(gone);
    }
  });

  // A primary button on the accent shipped white-on-red at 4.06:1, below AA. The
  // label is the dark ground instead; this is the arithmetic that guards it.
  it('passes AA for the primary button label on the accent', () => {
    expect(contrastRatio(darkTheme.accentForeground, darkTheme.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('configures typography tokens for Bricolage Grotesque, Newsreader, and IBM Plex Mono', () => {
    expect(typographyTokens.fontFamilies.sans).toContain('Bricolage Grotesque');
    expect(typographyTokens.fontFamilies.serif).toContain('Newsreader');
    expect(typographyTokens.fontFamilies.mono).toContain('IBM Plex Mono');

    expect(TYPOGRAPHY.fonts.heading).toContain('Bricolage Grotesque');
    expect(TYPOGRAPHY.fonts.body).toContain('Newsreader');
    expect(TYPOGRAPHY.fonts.mono).toContain('IBM Plex Mono');
    expect(GOOGLE_FONTS_URL).toContain('Bricolage+Grotesque');
  });

  // The gauge used to carry its own thresholds, one of which disagreed with the
  // engine's, so the same report could be drawn in one band and reported in
  // another. There is one scale, and it lives in the engine.
  it('should classify the composite score into bands on the engine scale and map colors', () => {
    expect(determineScoreBand(90)).toBe('solide');
    expect(determineScoreBand(80)).toBe('solide');
    expect(determineScoreBand(79)).toBe('perfectible');
    expect(determineScoreBand(75)).toBe('perfectible');
    expect(determineScoreBand(60)).toBe('fragile');
    expect(determineScoreBand(30)).toBe('problematique');

    const solideColors = getScoreBandColor('solide');
    expect(solideColors.stroke).toBe('#059669');
  });

  it('exposes exactly the five reader-facing score domains, weighted to 100 points', () => {
    expect(SCORE_DOMAINS).toEqual({
      robustesse_factuelle: expect.objectContaining({
        label: 'Robustesse factuelle et sourcing',
        weight: 35
      }),
      solidite_logique: expect.objectContaining({
        label: 'Solidité logique et argumentative',
        weight: 25
      }),
      cadrage_manipulation: expect.objectContaining({
        label: 'Cadrage et procédés rhétoriques',
        weight: 25
      }),
      deontologie: expect.objectContaining({
        label: 'Déontologie et transparence',
        weight: 10
      }),
      orthographe_grammaire: expect.objectContaining({
        label: 'Soin de la langue',
        weight: 5
      })
    });

    const domainKeys = Object.keys(SCORE_DOMAINS) as ScoreDomainKey[];
    const totalMax = domainKeys.reduce((acc, k) => acc + SCORE_DOMAINS[k].weight, 0);
    expect(totalMax).toBe(100);
  });

  // The dropped domains graded the journalist's craft, which a reader cannot act
  // on. Naming them here keeps them from creeping back in.
  it('no longer grades editorial craft', () => {
    const retired = [
      'clarte_lisibilite',
      'structure_progression',
      'coherence_editoriale',
      'angle_impact',
      'connexion_quotidien',
      'preservation_voix',
      'format_calibrage'
    ];
    for (const key of retired) {
      expect(SCORE_DOMAINS).not.toHaveProperty(key);
    }
  });

  it('weights factual robustness above every other domain', () => {
    const heaviest = (Object.keys(SCORE_DOMAINS) as ScoreDomainKey[]).sort(
      (a, b) => SCORE_DOMAINS[b].weight - SCORE_DOMAINS[a].weight
    )[0];
    expect(heaviest).toBe('robustesse_factuelle');
  });

  // Domain marks arrive with one decimal, and the panel is French throughout.
  it('prints domain marks with a French decimal separator', () => {
    expect(formatPoints(10.5)).toBe('10,5');
    expect(formatPoints(35)).toBe('35');
    expect(formatPoints(4.5)).toBe('4,5');
  });
});

// The badge palette is the reader's only cue to how damning a finding is, so it
// belongs to the design system rather than to one component's taste. Method
// section 3.5 defines four states, and their weights are not interchangeable.
describe('Verification badge palette', () => {
  it('names the four states with the method’s own reader-facing wording', () => {
    expect(VERIFICATION_STYLES.verifiee.label).toBe('Vérifiée');
    expect(VERIFICATION_STYLES['non-sourcee'].label).toBe('Non sourcée dans l’article');
    expect(VERIFICATION_STYLES.douteuse.label).toBe('Douteuse');
    expect(VERIFICATION_STYLES['non-verifiable'].label).toBe('Non vérifiable telle qu’écrite');
  });

  it('escalates colour only where the evidence justifies it', () => {
    expect(VERIFICATION_STYLES.verifiee.className).toContain('severity-positive');
    expect(VERIFICATION_STYLES.douteuse.className).toContain('severity-critical');

    // A sourcing observation is not a fault. It takes the neutral surface of the
    // palette, with a solid border, so it never reads as a warning: the reader
    // has to see it as a remark on the article's citations, nothing more.
    expect(VERIFICATION_STYLES['non-sourcee'].className).toContain('panel-muted');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('severity-critical');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('severity-warning');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('border-dashed');

    // Nothing was established either way, so the border stays provisional
    // instead of asserting a verdict, the same dashed warning the panel already
    // uses to declare a research stage that never ran.
    expect(VERIFICATION_STYLES['non-verifiable'].className).toContain('severity-warning');
    expect(VERIFICATION_STYLES['non-verifiable'].className).toContain('border-dashed');
    expect(VERIFICATION_STYLES['non-verifiable'].className).not.toContain('severity-critical');
  });

  // Dark-only means every state is painted on the one ground: a leftover
  // `dark:` variant would be a second theme nobody switches on any more.
  it('paints every state on the single dark ground, with no theme variants', () => {
    for (const style of Object.values(VERIFICATION_STYLES)) {
      expect(style.className).not.toContain('dark:');
      expect(style.className.length).toBeGreaterThan(0);
    }
  });
});
