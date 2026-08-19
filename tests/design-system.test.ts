import { describe, it, expect } from 'vitest';
import { lightTheme, darkTheme } from '../src/ui/tokens/colors';
import { TYPOGRAPHY, GOOGLE_FONTS_URL, typographyTokens } from '../src/ui/tokens/typography';
import { getScoreBand, getScoreBandColor } from '../src/ui/components/ScoreGauges';
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

  it('should correctly classify composite score into bands and map colors', () => {
    expect(getScoreBand(90)).toBe('solide');
    expect(getScoreBand(75)).toBe('perfectible');
    expect(getScoreBand(60)).toBe('fragile');
    expect(getScoreBand(30)).toBe('problematique');

    const solideColors = getScoreBandColor('solide');
    expect(solideColors.stroke).toBe('#059669');
  });

  it('should have all 10 Fourches Caudines score domains totaling 100 points', () => {
    const domainKeys = Object.keys(SCORE_DOMAINS) as ScoreDomainKey[];
    expect(domainKeys.length).toBe(10);
    const totalMax = domainKeys.reduce((acc, k) => acc + SCORE_DOMAINS[k].weight, 0);
    expect(totalMax).toBe(100);
  });
});
