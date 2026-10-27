import React, { useState } from 'react';
import { OFFER_LINE, SUBSCRIBE_LABEL, VAT_NOTE } from '@squiggle/shared';
import { TERMS_OF_SALE_URL } from '../../hosted/config';

/**
 * The moment the trial runs out, in the panel: the offer in one line, the
 * express request to start at once, and the payment opened from here rather
 * than through the account page. The web app's `web/src/components/Abonnement.tsx`
 * is the same box; the wording comes from `shared/` so the two cannot drift.
 */
export interface SubscribeOfferProps {
  title: string;
  /** Opens Checkout; rejects with a message the box shows. */
  onSubscribe: () => Promise<void>;
}

export const SubscribeOffer: React.FC<SubscribeOfferProps> = ({ title, onSubscribe }) => {
  const [startNow, setStartNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubscribe();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le paiement n’a pas pu s’ouvrir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={title} className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{OFFER_LINE}</p>
      {/* The express request of art. L221-25 that the conditions of sale rely on. */}
      <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={startNow}
          onChange={(e) => setStartNow(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <span>
          Je demande que l’abonnement commence dès le paiement. Si je me rétracte dans les 14 jours, je
          paierai les jours déjà écoulés.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void subscribe()}
        disabled={busy || !startNow}
        className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
      >
        {busy ? 'Ouverture du paiement…' : SUBSCRIBE_LABEL}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-faint">
        {VAT_NOTE}.{' '}
        <a href={TERMS_OF_SALE_URL} target="_blank" rel="noreferrer" className="underline hover:text-muted">
          Conditions de vente
        </a>
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-severity-critical/15 px-3 py-2 text-xs text-severity-critical-ink">
          {error}
        </p>
      )}
    </section>
  );
};
