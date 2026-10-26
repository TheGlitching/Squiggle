/**
 * The longest text one hosted analysis reads, shared by the server that
 * enforces it and the two clients that stop a text before sending it.
 *
 * 100 000 characters is about 16 000 words: room for the longest magazine
 * investigations, which run to 10 000-15 000 words, while a page that
 * strings several articles together (a home page, a live blog, a feed read
 * as one article) is refused instead of being analysed as one text. Fifty
 * press articles weigh several hundred thousand characters.
 */
export const MAX_ARTICLE_CHARS = 100_000;

/** Characters the analysis would read: the blocks' text, as the server counts it. */
export function articleLength(blocks: ReadonlyArray<{ text: string }>): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}

/** What the reader is told when a text is over the cap, by the server and the clients alike. */
export function articleTooLongMessage(chars: number): string {
  const fr = (n: number) => n.toLocaleString('fr-FR');
  return (
    `Ce texte compte ${fr(chars)} caractères, au-delà des ${fr(MAX_ARTICLE_CHARS)} qu’une analyse peut lire : ` +
    'la page regroupe sans doute plusieurs articles, ou des commentaires. ' +
    'Ouvrez l’article seul, puis relancez l’analyse.'
  );
}
