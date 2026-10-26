import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { generateKeyPairSync } from 'node:crypto';
import { HostedAnalysisClient, HostedApiError } from '@squiggle/shared';
import type { Finding, FindingCategory } from '@squiggle/shared';
import { CATEGORY_DEFINITIONS } from '../src/ui/components/CategoryFilterBar';
import { FindingCard } from '../src/ui/components/FindingCard';
import { ResearchDisclosure } from '../src/ui/components/ResearchDisclosure';
import {
  CATEGORY_LABELS_FR,
  engineCategoryToFilter,
  findingsToHighlightTargets,
} from '../src/adapters/findingAdapters';
import { ShadowHighlightOverlay } from '../src/content/shadowOverlay';

/**
 * The reader's text: one name per category on every surface, no grade on a
 * strength, nothing under 12 px, and a failure that names what actually failed.
 */

const ENGINE_CATEGORIES = Object.keys(CATEGORY_LABELS_FR) as FindingCategory[];

function finding(category: FindingCategory, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `f-${category}`,
    blockId: 'b1',
    category,
    quote: 'Une phrase de l’article.',
    severity: 1,
    label: 'Un constat',
    explanation: 'Une explication.',
    confidence: 0.8,
    ...overrides,
  };
}

describe('one label per category, on every surface', () => {
  it('gives the panel list, the filter pills and the badge on the page the same name', () => {
    const labelOnPage = (category: string) =>
      (ShadowHighlightOverlay.prototype as unknown as { formatCategoryLabel(c: string): string }).formatCategoryLabel.call(
        {},
        category
      );

    for (const category of ENGINE_CATEGORIES) {
      const panel = CATEGORY_LABELS_FR[category];
      const pill = CATEGORY_DEFINITIONS.find((pill) => pill.id === engineCategoryToFilter(category))?.frenchLabel;
      const [target] = findingsToHighlightTargets([finding(category)]);

      expect(pill, category).toBe(panel);
      expect(labelOnPage(target.category), category).toBe(panel);
    }
  });

  it('calls a strength “Point fort” on the page, not “Rigueur journalistique”', () => {
    const [target] = findingsToHighlightTargets([finding('point-fort')]);
    const badge = (ShadowHighlightOverlay.prototype as unknown as { formatCategoryLabel(c: string): string }).formatCategoryLabel.call(
      {},
      target.category
    );

    expect(badge).toBe('Point fort');
  });
});

describe('a strength carries no severity', () => {
  it('shows no “Mineur” badge beside “Point fort”, and still grades a defect', () => {
    const strength = renderToStaticMarkup(createElement(FindingCard, { finding: finding('point-fort', { severity: 1 }) }));
    const defect = renderToStaticMarkup(createElement(FindingCard, { finding: finding('sophisme', { severity: 1 }) }));

    expect(strength).toContain('Point fort');
    expect(strength).not.toMatch(/Mineur|Majeur|Critique/);
    expect(defect).toContain('Mineur');
  });
});

describe('legibility', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(tsx?|css)$/.test(name) ? [path] : [];
    });
  }

  // The guided tour is excluded: its sizes belong to the work that reshapes the tour.
  const files = sourceFiles('src').filter((path) => !path.endsWith('OnboardingTour.tsx'));
  // `text-[11px]`, `font-size: 11px`, `fontSize: '11px'` and `fontSize: 11`.
  const SIZE = /text-\[(\d+(?:\.\d+)?)px\]|font-size:\s*(\d+(?:\.\d+)?)px|fontSize:\s*['"]?(\d+(?:\.\d+)?)/g;

  it('sets no text under 12 px in the panel, the settings or the badge on the page', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(SIZE)) {
        if (Number(match[1] ?? match[2] ?? match[3]) < 12) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch a 10 px label', () => {
    expect([...'<span className="text-[10px]">'.matchAll(SIZE)]).toHaveLength(1);
    expect([...'font-size: 11px;'.matchAll(SIZE)]).toHaveLength(1);
    expect([...'fontSize: "11px"'.matchAll(SIZE)]).toHaveLength(1);
  });

  it('sets the badges that carry a meaning at 14 px', () => {
    const verification = readFileSync('src/ui/components/VerificationBadge.tsx', 'utf8');
    const severity = readFileSync('src/ui/components/SeverityBadge.tsx', 'utf8');
    const disclosure = renderToStaticMarkup(
      createElement(ResearchDisclosure, {
        research: {
          performed: true,
          queries: [],
          withdrawn: [],
          sourceChecks: [
            { url: 'https://a.example/x', title: 'A', relation: 'contredit', fiabilite: 'fiable', discordance: 'Dit le contraire.' },
          ],
        },
        claims: [],
      })
    );

    expect(verification).toMatch(/text-sm font-mono/);
    expect(severity).toMatch(/text-sm font-mono/);
    expect(disclosure).toMatch(/text-sm[^"]*">Contredit l’affirmation/);
  });
});

describe('a failure names what failed', () => {
  async function client(fetchImpl: typeof fetch): Promise<HostedAnalysisClient> {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const key = await crypto.subtle.importKey(
      'pkcs8',
      privateKey.export({ format: 'der', type: 'pkcs8' }),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    return new HostedAnalysisClient({ baseUrl: 'https://squiggle.test', token: 'tok', privateKey: key, fetchImpl });
  }

  const input = { url: 'https://news.example/a', blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Texte.', charStart: 0 }] };

  it('says the server cannot be reached when no response comes back, without blaming the model', async () => {
    const hosted = await client(async () => {
      throw new TypeError('Failed to fetch');
    });

    const error = await hosted.analyze(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HostedApiError);
    expect((error as HostedApiError).code).toBe('network');
    expect((error as HostedApiError).message).toMatch(/joindre le serveur/);
    expect((error as HostedApiError).message).not.toMatch(/modèle/i);
  });

  it('says the server is failing when something other than its JSON answers', async () => {
    const hosted = await client(async () => new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = (await hosted.analyze(input).catch((e: unknown) => e)) as HostedApiError;

    expect(error.code).toBe('server_unavailable');
    expect(error.message).toMatch(/serveur/);
    expect(error.message).not.toMatch(/modèle/i);
  });

  it('keeps the server’s own words when it reports that the model failed', async () => {
    const hosted = await client(async () =>
      Response.json({ ok: false, error: 'provider_unavailable', message: 'Service momentanément indisponible. Réessayez dans quelques minutes.' }, { status: 502 })
    );

    const error = (await hosted.analyze(input).catch((e: unknown) => e)) as HostedApiError;

    expect(error.code).toBe('provider_unavailable');
    expect(error.message).toBe('Service momentanément indisponible. Réessayez dans quelques minutes.');
  });
});
