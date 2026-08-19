import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { FindingCard } from '../src/ui/components/FindingCard';
import { ResearchDisclosure } from '../src/ui/components/ResearchDisclosure';
import { VERIFICATION_STYLES } from '../src/ui/components/VerificationBadge';
import type { EvidenceSource, FactualClaim, Finding, ResearchRecord } from '../src/engine/types';

declare global {
  /** React reads this to accept act() as a genuine test boundary. */
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseFinding: Finding = {
  id: 'f1',
  blockId: 'b1',
  quote: 'Le budget a doublé en deux ans.',
  category: 'affirmation-non-etayee',
  severity: 2,
  label: 'Affirmation non étayée',
  explanation: 'Le chiffre avancé demande une source.',
  confidence: 0.9,
  sources: [],
};

const articleSource: EvidenceSource = {
  title: 'Rapport annuel de la Cour des comptes',
  url: 'https://www.ccomptes.fr/rapport-2024',
  quote: 'Le budget progresse de 4 % sur la période.',
  origin: 'article',
};

const searchSource: EvidenceSource = {
  title: 'Note de conjoncture',
  url: 'https://insee.fr/statistiques/budget',
  origin: 'search',
};

describe('Finding evidence display', () => {
  it('renders a contradicted finding with its sources as safe external links', () => {
    const markup = renderToStaticMarkup(
      <FindingCard
        finding={{
          ...baseFinding,
          verification: 'contradicted',
          sources: [articleSource, searchSource],
        }}
      />
    );

    expect(markup).toContain(VERIFICATION_STYLES.contradicted.label);
    expect(markup).toContain('href="https://www.ccomptes.fr/rapport-2024"');
    expect(markup).toContain('href="https://insee.fr/statistiques/budget"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');

    // Domain plus title, no favicon request.
    expect(markup).toContain('ccomptes.fr');
    expect(markup).toContain('Rapport annuel de la Cour des comptes');
    expect(markup).not.toContain('favicon');

    // Provenance is what tells the reader how much a citation is worth.
    expect(markup).toContain('cité par l’article');
    expect(markup).toContain('trouvé en recherche');
  });

  it('renders an unverified finding as an absence of proof rather than a fault', () => {
    const markup = renderToStaticMarkup(
      <FindingCard finding={{ ...baseFinding, verification: 'unverified' }} />
    );

    expect(markup).toContain('Non vérifié');
    expect(markup).toContain('ni confirmé ni infirmé');
    expect(markup).not.toContain(VERIFICATION_STYLES.contradicted.label);
    expect(markup).not.toContain('faux');
    expect(markup).not.toContain('Sources consultées');
  });

  it('omits the verification badge on a finding that carries no verification', () => {
    const markup = renderToStaticMarkup(<FindingCard finding={baseFinding} />);

    expect(markup).not.toContain('Non vérifié');
    expect(markup).toContain('Majeur');
  });

  // The reader of an article cannot rewrite it, so the card explains the defect
  // and stops there. `explanation` carries the substance.
  it('explains a finding without offering rewrite advice', () => {
    const markup = renderToStaticMarkup(<FindingCard finding={baseFinding} />);

    expect(markup).toContain('Le chiffre avancé demande une source.');
    expect(markup).not.toContain('Suggestion');
    expect(markup).not.toContain('Reformul');
    expect(markup).not.toContain('reformul');
    expect(markup).not.toContain('corrig');
    expect(markup).not.toContain('avant publication');
  });

  it('follows a citation without toggling the card it was read from', () => {
    const onSelect = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <FindingCard
          finding={{ ...baseFinding, verification: 'contradicted', sources: [articleSource] }}
          onSelect={onSelect}
        />
      );
    });

    const link = host.querySelector('a');
    expect(link).not.toBeNull();

    act(() => {
      link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      host.querySelector('h4')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith('f1');

    act(() => root.unmount());
    host.remove();
  });
});

describe('Research disclosure', () => {
  it('states plainly that no research ran and names the reason', () => {
    const research: ResearchRecord = {
      performed: false,
      queries: [],
      skippedReason: 'le fournisseur configuré ne propose pas de recherche web',
      withdrawn: [],
    };

    const markup = renderToStaticMarkup(<ResearchDisclosure research={research} claims={[]} />);

    expect(markup).toContain('Vérification factuelle non effectuée');
    expect(markup).toContain('Aucune recherche factuelle n’a été menée');
    expect(markup).toContain('le fournisseur configuré ne propose pas de recherche web');
  });

  it('reports how many claims were checked and how many searches ran', () => {
    const claims: FactualClaim[] = [
      {
        id: 'c1',
        blockId: 'b1',
        quote: 'Le budget a doublé en deux ans.',
        claim: 'Le budget a doublé entre 2022 et 2024.',
        verification: 'contradicted',
        sources: [articleSource],
        rationale: 'Le rapport cité indique une progression de 4 %.',
      },
      {
        id: 'c2',
        blockId: 'b2',
        quote: 'La mesure entre en vigueur en janvier.',
        claim: 'La mesure entre en vigueur en janvier 2025.',
        verification: 'confirmed',
        sources: [searchSource],
      },
      {
        id: 'c3',
        blockId: 'b3',
        quote: 'Les effectifs stagnent.',
        claim: 'Les effectifs sont stables depuis 2020.',
        verification: 'unverified',
        sources: [],
      },
    ];

    const research: ResearchRecord = {
      performed: true,
      provider: 'anthropic',
      queries: ['budget 2024 cour des comptes', 'entrée en vigueur mesure janvier 2025'],
      withdrawn: [],
    };

    const markup = renderToStaticMarkup(<ResearchDisclosure research={research} claims={claims} />);

    expect(markup).toContain('2 affirmations vérifiées sur 3');
    expect(markup).toContain('2 recherches menées');
    expect(markup).toContain('via anthropic');
    expect(markup).not.toContain('non effectuée');

    // The two claims with evidence are listed; the unchecked one has nothing to show.
    expect(markup).toContain('Voir les 2 affirmations examinées');
    expect(markup).toContain('Le rapport cité indique une progression de 4 %.');
    expect(markup).toContain('href="https://insee.fr/statistiques/budget"');
    expect(markup).not.toContain('Les effectifs sont stables depuis 2020.');
  });

  it('shows the objections evidence refuted, and says the score predates that check', () => {
    const research: ResearchRecord = {
      performed: true,
      provider: 'anthropic',
      queries: ['maire de Nice'],
      withdrawn: [
        {
          blockId: 'b1',
          quote: 'Éric Ciotti est maire de Nice depuis juin 2024',
          reason: 'Les sources consultées confirment ce que dit l’article.',
          sources: [
            {
              title: 'Ville de Nice',
              url: 'https://nice.fr/actualites/maire',
              origin: 'search',
            },
          ],
        },
      ],
    };

    const markup = renderToStaticMarkup(<ResearchDisclosure research={research} claims={[]} />);

    // A refuted objection is never shown as a fault, but it is not erased either:
    // the reader sees what was doubted and what cleared it.
    expect(markup).toContain('1 objection écartée après vérification');
    expect(markup).toContain('Éric Ciotti est maire de Nice depuis juin 2024');
    expect(markup).toContain('href="https://nice.fr/actualites/maire"');

    // The score came from marks the model gave while it still believed the
    // objection, so the disclosure has to say so rather than imply a rescoring.
    expect(markup).toContain('avant cette vérification');
  });

  it('shows no withdrawal block when every objection survived research', () => {
    const research: ResearchRecord = {
      performed: true,
      provider: 'anthropic',
      queries: ['budget'],
      withdrawn: [],
    };

    const markup = renderToStaticMarkup(<ResearchDisclosure research={research} claims={[]} />);

    expect(markup).not.toContain('écartée après vérification');
  });
});
