/** A date as a reader of the French site writes it: `12 octobre 2026`. */
export function frenchDate(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
