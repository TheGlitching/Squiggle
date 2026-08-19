import { describe, it, expect } from 'vitest';
import { lightTheme, darkTheme } from '../src/ui/tokens/colors';
import { TYPOGRAPHY, GOOGLE_FONTS_URL, typographyTokens } from '../src/ui/tokens/typography';
import { formatPoints, getScoreBandColor } from '../src/ui/components/ScoreGauges';
import { determineScoreBand } from '../src/engine/scoring';
import { SCORE_DOMAINS, ScoreDomainKey } from '../src/engine/types';
import { VERIFICATION_STYLES } from '../src/ui/components/VerificationBadge';

describe('Editorial Design System & Tokens', () => {
  it('should define complete color tokens for both light and dark modes', () => {
    expect(lightTheme.bg).toBeDefined();
    expect(darkTheme.bg).toBeDefined();
    expect(lightTheme.accent).toBeDefined();
    expect(darkTheme.accent).toBeDefined();

    // 6 finding category colors
    expect(lightTheme.sophisme).toBeDefined();
    expect(lightTheme.unsupported).toBeDefined();
    expect(lightTheme.overreach).toBeDefined();
    expect(lightTheme.sourceAbsent).toBeDefined();
    expect(lightTheme.framing).toBeDefined();
    expect(lightTheme.strength).toBeDefined();
  });

  it('should configure typography tokens for Bricolage Grotesque, Newsreader, and IBM Plex Mono', () => {
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
    expect(VERIFICATION_STYLES.verifiee.className).toContain('emerald');
    expect(VERIFICATION_STYLES.douteuse.className).toContain('rose');

    // A sourcing observation is not a fault. It takes the neutral stone of the
    // palette, with a solid border, so it never reads as a warning: the reader
    // has to see it as a remark on the article's citations, nothing more.
    expect(VERIFICATION_STYLES['non-sourcee'].className).toContain('stone');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('rose');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('amber');
    expect(VERIFICATION_STYLES['non-sourcee'].className).not.toContain('border-dashed');

    // Nothing was established either way, so the border stays provisional
    // instead of asserting a verdict, the same dashed amber the panel already
    // uses to declare a research stage that never ran.
    expect(VERIFICATION_STYLES['non-verifiable'].className).toContain('amber');
    expect(VERIFICATION_STYLES['non-verifiable'].className).toContain('border-dashed');
    expect(VERIFICATION_STYLES['non-verifiable'].className).not.toContain('rose');
  });

  it('carries a dark-mode variant for every state, like every other token', () => {
    for (const style of Object.values(VERIFICATION_STYLES)) {
      expect(style.className).toContain('dark:bg-');
      expect(style.className).toContain('dark:text-');
      expect(style.className).toContain('dark:border-');
    }
  });
});
