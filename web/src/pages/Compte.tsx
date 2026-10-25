import { useEffect, useState } from 'react';

import { getAccount, logout, messageForError, openPortal, startCheckout, type Account } from '../api';
import { DonneesCompte } from '../components/DonneesCompte';
import { PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON } from '../components/Landing';
import { SignIn } from '../components/SignIn';
import { frenchDate } from '../format';
import { DAILY_ANALYSES, SUBSCRIBE_LABEL, VAT_NOTE } from '../offer';
import { Link, navigate, usePath } from '../router';
import { describeAccount } from '../usage';

/** The analyses left, as tiles: lit for each one still available. */
function Usage({ remaining, limit }: { remaining: number; limit: number }) {
  const tiles = Math.min(limit, 12);
  return (
    <div>
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none font-semibold tracking-tight tabular-nums">{remaining}</span>
        <span className="text-lg text-muted">sur {limit}</span>
      </p>
      <div
        role="img"
        aria-label={`${remaining} analyse${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} sur ${limit}`}
        className="mt-3 flex gap-1.5"
      >
        {Array.from({ length: tiles }, (_, index) => (
          <span
            key={index}
            className={`h-3 w-6 rounded-sm ${index < remaining ? 'bg-foreground' : 'border border-borderControl'}`}
          />
        ))}
      </div>
    </div>
  );
}

export function Compte() {
  const path = usePath();
  const params = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
  const payment = params.get('paiement');

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [startNow, setStartNow] = useState(false);

  function load() {
    setLoading(true);
    getAccount()
      .then(setAccount)
      .catch((err) => setError(messageForError(err)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCheckout();
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await openPortal();
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  async function signOut() {
    await logout().catch(() => {});
    setAccount(null);
    navigate('/');
  }

  if (loading) {
    return <p className="mx-auto max-w-md px-5 py-16 text-muted">Chargement de votre compte…</p>;
  }

  if (deleted) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16">
        <h1 className="m-0 font-display text-4xl font-semibold tracking-tight">Compte supprimé</h1>
        <p role="status" className="mt-3 text-lg text-muted">
          Votre compte et ses données ont été effacés. Vous pouvez fermer cette page.
        </p>
        <Link to="/" className={`${SECONDARY_BUTTON} mt-6`}>
          Revenir à l’accueil
        </Link>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-16">
        <h1 className="m-0 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Mon compte</h1>
        <p className="mt-3 mb-8 text-lg text-muted">Connectez-vous pour voir votre abonnement et votre usage.</p>
        <SignIn next="/compte" error={error} onSignedIn={load} />
      </div>
    );
  }

  const view = describeAccount(account);
  const expires = frenchDate(account.planExpiresAt);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <h1 className="m-0 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Mon compte</h1>
      <p className="mt-2 mb-0 text-lg text-muted">{account.email}</p>

      {payment === 'ok' ? (
        <p role="status" className="mt-6 mb-0 rounded-card bg-accentSoft px-5 py-4 text-base">
          {account.plan === 'active'
            ? 'Merci ! Votre abonnement est actif.'
            : 'Merci ! Votre abonnement est en cours d’activation. Actualisez cette page dans un instant.'}
        </p>
      ) : null}
      {payment === 'annule' ? (
        <p role="status" className="mt-6 mb-0 rounded-card bg-surface px-5 py-4 text-base">
          Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-6 mb-0 rounded-card border border-critical bg-criticalSoft px-5 py-4 text-base text-criticalInk">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="formule-titre" className="mt-8 rounded-card bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h2 id="formule-titre" className="m-0 text-2xl font-semibold tracking-tight">
              {view.title}
            </h2>
            <p className="mt-1 mb-0 text-base text-muted">{view.detail}</p>
            {expires && account.plan === 'active' ? (
              <p className="mt-1 mb-0 text-sm text-muted">Prochaine échéance : {expires}</p>
            ) : null}
          </div>
          <Usage remaining={account.usage.remaining} limit={account.usage.limit} />
        </div>

        <div className="mt-8 grid gap-4">
          {view.canSubscribe ? (
            <div className="grid gap-3">
              {/* The express request of art. L221-25 that the conditions of sale rely on. */}
              <label className="flex max-w-xl items-start gap-3 text-base leading-relaxed text-muted">
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(event) => setStartNow(event.target.checked)}
                  className="mt-1.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span>
                  Je demande que l’abonnement commence dès le paiement. Si je me rétracte dans les 14 jours, je paierai
                  les jours déjà écoulés.
                </span>
              </label>
              <button onClick={subscribe} disabled={busy || !startNow} className={`${PRIMARY_BUTTON} justify-self-start max-sm:w-full`}>
                {SUBSCRIBE_LABEL}
              </button>
              <p className="m-0 text-sm text-muted">
                {DAILY_ANALYSES} analyses par jour, sans engagement, renouvelé chaque mois. {VAT_NOTE}.{' '}
                <Link to="/cgv" className="underline underline-offset-4 hover:text-foreground">
                  Conditions de vente
                </Link>
              </p>
            </div>
          ) : null}
          {view.state === 'active' || view.state === 'quota_exhausted' ? (
            <button onClick={manage} disabled={busy} className={`${SECONDARY_BUTTON} justify-self-start`}>
              Gérer ou résilier mon abonnement
            </button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="navigateur-titre" className="mt-4 rounded-card bg-surface p-6 sm:p-8">
        <h2 id="navigateur-titre" className="m-0 text-xl font-semibold">
          Squiggle dans votre navigateur
        </h2>
        <p className="mt-2 mb-4 max-w-[62ch] text-base leading-relaxed text-muted">
          Vous avez ajouté le bouton Squiggle à Chrome ou Firefox ? Reliez-le à ce compte : ses analyses passent alors par
          votre formule.
        </p>
        <Link to="/pont" className={QUIET_LINK}>
          Relier le bouton à ce compte
        </Link>
      </section>

      <DonneesCompte
        account={account}
        onSignOut={signOut}
        onEmailChanged={(email) => setAccount((current) => (current ? { ...current, email } : current))}
        onDeleted={() => {
          setAccount(null);
          setDeleted(true);
        }}
      />
    </div>
  );
}
