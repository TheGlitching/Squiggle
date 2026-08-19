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
  it('renders a doubted finding with its sources as safe external links', () => {
    const markup = renderToStaticMarkup(
      <FindingCard
        finding={{
          ...baseFinding,
          verification: 'douteuse',
          sources: [articleSource, searchSource],
        }}
      />
    );

    expect(markup).toContain(VERIFICATION_STYLES.douteuse.label);
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

  // The whole reason the classification grew a fourth state. An article that
  // mentions an interview without naming the outlet has a sourcing gap; showing
  // that as a doubt reads as an accusation of being wrong.
  it('renders an unsourced-but-checkable claim as a sourcing observation, never as a doubt', () => {
    const markup = renderToStaticMarkup(
      <FindingCard finding={{ ...baseFinding, verification: 'non-sourcee' }} />
    );

    expect(markup).toContain('Non sourcée dans l’article');
    expect(markup).toContain('pas un doute sur son exactitude');
    expect(markup).not.toContain(VERIFICATION_STYLES.douteuse.label);
    expect(markup).not.toContain(VERIFICATION_STYLES['non-verifiable'].label);
    expect(markup).not.toContain('faux');

    // A sourcing remark must not borrow the colours that mean "problem".
    expect(markup).toContain(VERIFICATION_STYLES['non-sourcee'].className);
    expect(markup).not.toContain('rose-');
    expect(markup).not.toContain('border-dashed');
  });

  it('renders a claim that cannot be checked as worded as a limit, not a fault', () => {
    const markup = renderToStaticMarkup(
      <FindingCard finding={{ ...baseFinding, verification: 'non-verifiable' }} />
    );

    expect(markup).toContain('Non vérifiable telle qu’écrite');
    expect(markup).toContain('ne peut pas être confrontée à des sources');
    expect(markup).toContain('rien ne permet de la reprocher à l’article');
    expect(markup).not.toContain(VERIFICATION_STYLES.douteuse.label);
    expect(markup).not.toContain('Sources consultées');
  });

  it('renders a confirmed claim as settled', () => {
    const markup = renderToStaticMarkup(
      <FindingCard finding={{ ...baseFinding, verification: 'verifiee', sources: [searchSource] }} />
    );

    expect(markup).toContain('Vérifiée');
    expect(markup).toContain('confirment ce point de l’article');
    expect(markup).toContain('emerald-');
  });

  // Two of the four states used to share the old neutral style, which is exactly
  // the conflation being removed: a reader has to be able to tell them apart at
  // a glance, label and colour both.
  it('gives each of the four states an appearance no other state shares', () => {
    const states = ['verifiee', 'non-sourcee', 'douteuse', 'non-verifiable'] as const;

    const labels = states.map((state) => VERIFICATION_STYLES[state].label);
    expect(new Set(labels).size).toBe(4);

    const classNames = states.map((state) => VERIFICATION_STYLES[state].className);
    expect(new Set(classNames).size).toBe(4);

    const hints = states.map((state) => VERIFICATION_STYLES[state].hint);
    expect(new Set(hints).size).toBe(4);

    // And the rendered badge keeps the accessible name pattern for every one.
    for (const state of states) {
      const markup = renderToStaticMarkup(
        <FindingCard finding={{ ...baseFinding, verification: state }} />
      );
      expect(markup).toContain(
        `aria-label="${VERIFICATION_STYLES[state].label}. ${VERIFICATION_STYLES[state].hint}"`
      );
    }
  });

  it('omits the verification badge on a finding that carries no verification', () => {
    const markup = renderToStaticMarkup(<FindingCard finding={baseFinding} />);

    expect(markup).not.toContain('Non vérifiable');
    expect(markup).not.toContain('Non sourcée');
    expect(markup).toContain('Majeur');
  });

  // The old fallback sent anything unknown to the neutral style, which is how a
  // state could be shown wearing another state's meaning. An unknown state now
  // says so rather than impersonating one of the four.
  it('does not let an unrecognised state borrow another state’s appearance', () => {
    const markup = renderToStaticMarkup(
      <FindingCard
        finding={{ ...baseFinding, verification: 'etat-inconnu' as unknown as Finding['verification'] }}
      />
    );

    expect(markup).toContain('État non reconnu');
    for (const style of Object.values(VERIFICATION_STYLES)) {
      expect(markup).not.toContain(style.label);
      expect(markup).not.toContain(style.className);
    }
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
          finding={{ ...baseFinding, verification: 'douteuse', sources: [articleSource] }}
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

  it('counts only the claims actually confronted with a source, and never inflates that with unsourced or uncheckable ones', () => {
    const claims: FactualClaim[] = [
      {
        id: 'c1',
        blockId: 'b1',
        quote: 'Le budget a doublé en deux ans.',
        claim: 'Le budget a doublé entre 2022 et 2024.',
        verification: 'douteuse',
        sources: [articleSource],
        rationale: 'Le rapport cité indique une progression de 4 %.',
      },
      {
        id: 'c2',
        blockId: 'b2',
        quote: 'La mesure entre en vigueur en janvier.',
        claim: 'La mesure entre en vigueur en janvier 2025.',
        verification: 'verifiee',
        sources: [searchSource],
      },
      {
        id: 'c3',
        blockId: 'b3',
        quote: 'Les effectifs stagnent.',
        claim: 'Les effectifs sont stables depuis 2020.',
        verification: 'non-verifiable',
        sources: [],
      },
      {
        id: 'c4',
        blockId: 'b4',
        quote: 'Un entretien accordé la semaine dernière.',
        claim: 'L’intéressé a accordé un entretien la semaine dernière.',
        verification: 'non-sourcee',
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

    // Only 'verifiee' and 'douteuse' mean evidence was read. Counting the other
    // two would claim the audit checked things it never looked at.
    expect(markup).toContain('2 affirmations sur 4 confrontées à une source');
    expect(markup).toContain('2 recherches menées');
    expect(markup).toContain('via anthropic');
    expect(markup).not.toContain('non effectuée');
    expect(markup).not.toContain('4 affirmations sur 4');

    // The two claims with evidence are listed; the ones with nothing to show are not.
    expect(markup).toContain('Voir les 2 affirmations examinées');
    expect(markup).toContain('Le rapport cité indique une progression de 4 %.');
    expect(markup).toContain('href="https://insee.fr/statistiques/budget"');
    expect(markup).not.toContain('Les effectifs sont stables depuis 2020.');

    // The breakdown names each state in the method's own words, so a reader who
    // never opens the details still knows how the four states divide up, and a
    // sourcing gap is named as one rather than lumped in with the doubts.
    expect(markup).toContain('1 vérifiée');
    expect(markup).toContain('1 douteuse');
    expect(markup).toContain('1 non sourcée dans l’article');
    expect(markup).toContain('1 non vérifiable telle qu’écrite');
    expect(markup).not.toContain('2 douteuses');
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
