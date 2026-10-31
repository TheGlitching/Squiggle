/**
 * A PDF's runs of text put back into headings and paragraphs, on runs laid out
 * as pdf.js gives them for a two-column report: a running header and a page
 * number on every page, a heading set larger, paragraphs whose sentence carries
 * over a column, a page and a figure's title, a word cut at a line's end, a
 * superscript, a footnote, a figure's small print and a table of contents.
 */
import { describe, expect, it } from 'vitest';

import { pdfBlocks, readPdf, type PdfTextItem } from '../src/extract/pdf';

/** A page's runs, one per line, from the top: `[text, x, y, height]`. */
const page = (...lines: Array<[string, number, number, number?]>): PdfTextItem[] =>
  lines.map(([str, x, y, height = 10]) => ({ str, x, y, width: str.length * 5, height }));

const header = (n: number): Array<[string, number, number, number?]> => [
  ['RAPPORT PUBLIC', 300, 800, 8],
  [String(n), 60, 800, 8],
];

describe('pdfBlocks', () => {
  it('rebuilds headings and paragraphs, over columns and pages, without the running header', () => {
    const blocks = pdfBlocks([
      page(
        ...header(1),
        ['Une hausse inédite', 60, 760, 16],
        ['de la dette', 60, 735, 16],
        ['La dette publique a progressé de 5 %', 60, 700],
        ['en un an, selon la Cour, et l’infor-', 60, 688],
        ['mation a surpris.', 60, 676],
        ['Un second paragraphe commence ici et', 60, 650],
        // The next column, back at the top.
        ['se poursuit dans la colonne suivante.', 320, 700],
        ['1. Évolution de la dette', 320, 600, 12],
        ['2020', 320, 560, 6],
        ['2025', 400, 560, 6],
        ['Un dernier paragraphe reste ouvert sur', 320, 500],
      ),
      page(...header(2), ['la page suivante.', 60, 760]),
    ]);
    expect(blocks).toEqual([
      { type: 'heading', text: 'Une hausse inédite de la dette', page: 1 },
      { type: 'paragraph', text: 'La dette publique a progressé de 5 % en un an, selon la Cour, et l’information a surpris.', page: 1 },
      { type: 'paragraph', text: 'Un second paragraphe commence ici et se poursuit dans la colonne suivante.', page: 1 },
      { type: 'heading', text: '1. Évolution de la dette', page: 1 },
      { type: 'paragraph', text: 'Un dernier paragraphe reste ouvert sur la page suivante.', page: 1 },
    ]);
  });

  it('takes up a sentence left open before a figure’s title, and starts afresh on a capital after a full stop', () => {
    const blocks = pdfBlocks([
      page(
        ['Le nombre de naissances est inférieur à son niveau de', 60, 700],
        ['Figure 2. Naissances', 320, 760, 12],
        ['2010, le plus bas depuis 1942.', 320, 700],
        ['Une autre phrase ouvre un paragraphe.', 60, 400],
      ),
    ]);
    expect(blocks.map((b) => b.text)).toEqual([
      'Le nombre de naissances est inférieur à son niveau de 2010, le plus bas depuis 1942.',
      'Figure 2. Naissances',
      'Une autre phrase ouvre un paragraphe.',
    ]);
  });

  it('keeps a superscript on its line, and drops a table of contents', () => {
    const blocks = pdfBlocks([
      page(
        ['Sommaire', 60, 760, 16],
        ['Synthèse . . . . . . . . . . 5', 60, 700],
        ['Introduction . . . . . . . . 9', 60, 688],
        ['Chapitre I . . . . . . . . . 13', 60, 676],
      ),
      [
        { str: 'Au 1', x: 60, y: 700, width: 20, height: 10 },
        { str: 'er', x: 80, y: 704, width: 6, height: 6 },
        { str: ' janvier, la population augmente.', x: 86, y: 700, width: 150, height: 10 },
      ],
    ]);
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Au 1er janvier, la population augmente.', page: 2 }]);
  });

  it('drops a footnote, and a symbol font’s private glyph', () => {
    const blocks = pdfBlocks([
      [
        { str: 'Le texte courant renvoie à une note et continue assez longuement.', x: 60, y: 700, width: 300, height: 10 },
        { str: '\uf0b7 Une puce lue dans une police de symboles.', x: 60, y: 680, width: 300, height: 10 },
        { str: '1', x: 60, y: 103, width: 3, height: 6 },
        { str: 'La note, qui court sur', x: 64, y: 100, width: 200, height: 9 },
        { str: 'deux lignes.', x: 60, y: 89, width: 60, height: 9 },
      ],
    ]);
    expect(blocks.map((b) => b.text)).toEqual([
      'Le texte courant renvoie à une note et continue assez longuement.',
      'Une puce lue dans une police de symboles.',
    ]);
  });

  it('calls a large paragraph that ends a sentence an introduction, not a heading', () => {
    const blocks = pdfBlocks([
      page(['Ainsi, le solde naturel est négatif en 2025.', 60, 760, 12], ['Le texte courant suit, plus petit, et il est plus long que l’introduction.', 60, 700]),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });
});

describe('readPdf', () => {
  /** A stand-in for pdf.js: two pages, a title only a word processor would give. */
  function fakePdfJs(title: string) {
    let destroyed = 0;
    const items = [
      page(['Le bilan de l’année', 60, 760, 16], ['Le texte du rapport commence ici.', 60, 700]),
      page(['Il se termine là.', 60, 760]),
    ];
    const document = {
      numPages: 2,
      getMetadata: async () => ({ info: { Title: title } }),
      getPage: async (n: number) => ({
        getTextContent: async () => ({
          items: items[n - 1].map(({ str, x, y, width, height }) => ({ str, transform: [height, 0, 0, height, x, y], width, height })),
        }),
      }),
    };
    return {
      pdfjs: {
        getDocument: () => ({ promise: Promise.resolve(document), destroy: async () => void destroyed++ }),
      },
      destroyed: () => destroyed,
    };
  }

  it('reads the pages in order, titles the text from its first heading over a file name, and lets the file go', async () => {
    const fake = fakePdfJs('Microsoft Word - bilan_v3.docx');
    const read = await readPdf(fake.pdfjs, new Uint8Array([37, 80, 68, 70]));
    expect(read.title).toBe('Le bilan de l’année');
    expect(read.pages).toBe(2);
    expect(read.blocks.map((b) => [b.text, b.page])).toEqual([
      ['Le bilan de l’année', 1],
      ['Le texte du rapport commence ici.', 1],
      ['Il se termine là.', 2],
    ]);
    await read.close();
    expect(fake.destroyed()).toBe(1);
  });

  it('keeps the title the file gives when it is a real one', async () => {
    const read = await readPdf(fakePdfJs('La situation des finances publiques').pdfjs, new Uint8Array());
    expect(read.title).toBe('La situation des finances publiques');
  });
});
