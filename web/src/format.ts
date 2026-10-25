/** A date as a reader of the French site writes it: `12 octobre 2026`. */
export function frenchDate(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** French punctuation never opens a line: `?`, `!`, `:`, `;` and `»` keep to the word before them. */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
}
