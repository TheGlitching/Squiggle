import { useState } from 'react';

import { messageForError, startCheckout, startTeacherCheckout, type Account, type CheckoutReturn } from '../api';
import { count } from '../count';
import { MONTHLY_ANALYSES, SUBSCRIBE_LABEL, VAT_NOTE } from '../offer';
import { Link } from '../router';
import { PRIMARY_BUTTON } from './Landing';

/**
 * The subscribe action, wherever a reader is offered it: the account page, and
 * under a report or in place of the analyse button once the trial is spent. It
 * goes straight to Checkout from where it is shown, so paying never needs a
 * detour through `/compte`. An academic address is offered the teacher access
 * instead, as on the account page.
 */
export function Abonnement({ account, retour = '/compte' }: { account: Account; retour?: CheckoutReturn }) {
  const [busy, setBusy] = useState(false);
  const [startNow, setStartNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goToCheckout(start: (retour: CheckoutReturn) => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await start(retour);
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  const failure = error ? (
    <p role="alert" className="mt-3 mb-0 text-sm text-criticalInk">
      {error}
    </p>
  ) : null;

  if (account.teacherOffer) {
    return (
      <div>
        <button
          onClick={() => goToCheckout(startTeacherCheckout)}
          disabled={busy}
          className={`${PRIMARY_BUTTON} max-sm:w-full disabled:opacity-50`}
        >
          Accès enseignant
        </button>
        <p className="mt-3 mb-0 max-w-xl text-sm text-muted">
          Votre adresse académique vous ouvre l’abonnement complet, gratuit jusqu’au 30 juin : {MONTHLY_ANALYSES}{' '}
          analyses par mois, sans carte bancaire. Il s’arrête de lui-même à cette date.
        </p>
        {failure}
      </div>
    );
  }

  return (
    <div>
      {/* The express request of art. L221-25 that the conditions of sale rely on. */}
      <label className="mb-4 flex max-w-xl items-start gap-3 text-base text-muted">
        <input
          type="checkbox"
          checked={startNow}
          onChange={(event) => setStartNow(event.target.checked)}
          className="mt-1 h-4.5 w-4.5 shrink-0 accent-accent"
        />
        <span>
          Je demande que l’abonnement commence dès le paiement. Si je me rétracte dans les 14 jours, je paierai les
          jours déjà écoulés.
        </span>
      </label>
      <button
        onClick={() => {
          count('click_subscribe');
          void goToCheckout(startCheckout);
        }}
        disabled={busy || !startNow}
        className={`${PRIMARY_BUTTON} max-sm:w-full disabled:opacity-50`}
      >
        {SUBSCRIBE_LABEL}
      </button>
      <p className="mt-3 mb-0 text-sm text-muted">
        {MONTHLY_ANALYSES} analyses par mois, sans engagement, renouvelé chaque mois. {VAT_NOTE}.{' '}
        <Link to="/cgv" className="underline underline-offset-4 hover:text-foreground">
          Conditions de vente
        </Link>
      </p>
      {failure}
    </div>
  );
}
