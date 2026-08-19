import { describe, it, expect } from 'vitest';
import { lightTheme, darkTheme } from '../src/ui/tokens/colors';
import { TYPOGRAPHY, GOOGLE_FONTS_URL, typographyTokens } from '../src/ui/tokens/typography';
import { formatPoints, getScoreBandColor } from '../src/ui/components/ScoreGauges';
import { determineScoreBand } from '../src/engine/scoring';
import { SCORE_DOMAINS, ScoreDomainKey } from '../src/engine/types';

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
