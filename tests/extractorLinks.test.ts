import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleExtractor } from '../src/content/extractor';

describe('Article Extractor - hyperlink capture', () => {
  let mockDoc: Document;

  beforeEach(() => {
    mockDoc = document.implementation.createHTMLDocument('Test Document');
  });

  function setCanonical(href: string): void {
    const link = mockDoc.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);
    mockDoc.head.appendChild(link);
  }

  function addParagraph(html: string): HTMLParagraphElement {
    const p = mockDoc.createElement('p');
    p.innerHTML = html;
    mockDoc.body.appendChild(p);
    return p;
  }

  it('captures per-block links with absolute hrefs', () => {
    setCanonical('https://lemonde.fr/article/2024/enquete.html');
    addParagraph(
      'Selon une <a href="https://www.insee.fr/statistiques/12345">étude de l\'Insee</a> publiée hier, la tendance se confirme.'
    );

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toEqual([
      { text: "étude de l'Insee", href: 'https://www.insee.fr/statistiques/12345' },
    ]);
  });

  it('resolves relative hrefs against the canonical article URL', () => {
    setCanonical('https://lemonde.fr/section/article-123.html');
    addParagraph('Voir le <a href="/dossiers/rapport-annuel.pdf">rapport annuel</a> complet.');

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toEqual([
      { text: 'rapport annuel', href: 'https://lemonde.fr/dossiers/rapport-annuel.pdf' },
    ]);
  });

  it('excludes in-page fragment, mailto, and javascript anchors', () => {
    setCanonical('https://lemonde.fr/article-123.html');
    addParagraph(
      'Sommaire : <a href="#section-2">section 2</a>, ' +
        'contact : <a href="mailto:redaction@lemonde.fr">la rédaction</a>, ' +
        'partage : <a href="javascript:void(0)">partager</a>.'
    );

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toBeUndefined();
  });

  it('excludes self-host links from citedSources but keeps them on the block', () => {
    setCanonical('https://lemonde.fr/article-123.html');
    addParagraph(
      'Lire aussi notre <a href="https://www.lemonde.fr/autre-article.html">précédent article</a> ' +
        'et cette <a href="https://www.insee.fr/statistiques/12345">étude externe</a>.'
    );

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toHaveLength(2);
    expect(article.citedSources).toEqual([
      {
        href: 'https://www.insee.fr/statistiques/12345',
        domain: 'insee.fr',
        text: 'étude externe',
        blockId: 'block-0',
      },
    ]);
  });

  it('de-duplicates citedSources by URL, keeps first-seen order, and keeps the best anchor text', () => {
    setCanonical('https://lemonde.fr/article-123.html');
    addParagraph('Une première mention de <a href="https://www.insee.fr/s/1">cette source</a>.');
    addParagraph('Voir aussi <a href="https://www.insee.fr/s/1">le rapport complet de l\'Insee</a>.');
    addParagraph('Et enfin <a href="https://www.oecd.org/report">un second rapport</a>.');

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.citedSources).toEqual([
      {
        href: 'https://www.insee.fr/s/1',
        domain: 'insee.fr',
        text: "le rapport complet de l'Insee",
        blockId: 'block-0',
      },
      {
        href: 'https://www.oecd.org/report',
        domain: 'oecd.org',
        text: 'un second rapport',
        blockId: 'block-2',
      },
    ]);
  });

  it('leaves links undefined on a block with no anchors', () => {
    setCanonical('https://lemonde.fr/article-123.html');
    addParagraph('Un paragraphe tout à fait ordinaire sans aucun lien hypertexte.');

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toBeUndefined();
    expect(article.citedSources).toEqual([]);
  });

  it('resolves relative hrefs against a <base> element when present, without a canonical link', () => {
    const base = mockDoc.createElement('base');
    base.setAttribute('href', 'https://exemple-info.fr/dossier/');
    mockDoc.head.appendChild(base);
    addParagraph('Consulter les <a href="annexes.html">annexes</a> du dossier.');

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toEqual([
      { text: 'annexes', href: 'https://exemple-info.fr/dossier/annexes.html' },
    ]);
  });

  it('excludes a subscription pitch hosted on another subdomain of the publisher from citedSources - the reported registrable-domain defect', () => {
    setCanonical('https://www.lamontagne.fr/politique/article-123.html');
    addParagraph(
      'Cet article est réservé aux abonnés, <a href="https://abonne.lamontagne.fr/offre">découvrez nos offres</a> ' +
        'ou lisez cette <a href="https://www.insee.fr/statistiques/12345">étude de l\'Insee</a>.'
    );

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.citedSources).toEqual([
      {
        href: 'https://www.insee.fr/statistiques/12345',
        domain: 'insee.fr',
        text: "étude de l'Insee",
        blockId: 'block-0',
      },
    ]);
  });

  it('resolves a relative canonical href before using it as a base, instead of discarding every citation - the reported canonical-resolution defect', () => {
    setCanonical('/politique/article-123');
    addParagraph(
      'Selon une <a href="https://www.insee.fr/statistiques/12345">étude de l\'Insee</a> publiée hier, la tendance se confirme.'
    );

    const article = new ArticleExtractor(mockDoc).extract();

    expect(article.blocks[0].links).toEqual([
      { text: "étude de l'Insee", href: 'https://www.insee.fr/statistiques/12345' },
    ]);
    expect(article.citedSources).toEqual([
      {
        href: 'https://www.insee.fr/statistiques/12345',
        domain: 'insee.fr',
        text: "étude de l'Insee",
        blockId: 'block-0',
      },
    ]);
  });
});
