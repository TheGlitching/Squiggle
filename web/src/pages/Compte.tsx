import { useEffect, useState } from 'react';

import { getAccount, logout, messageForError, openPortal, startCheckout, type Account } from '../api';
import { DonneesCompte } from '../components/DonneesCompte';
import { BrowserFigure } from '../components/Figures';
import { Eyebrow, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../components/Landing';
import { frenchDate } from '../format';
import { DAILY_ANALYSES, SUBSCRIBE_LABEL, VAT_NOTE } from '../offer';
import { Link, navigate, usePath } from '../router';
import { describeAccount } from '../usage';

/** What is left of the day's or the trial's analyses, as a ring that empties. */
function UsageRing({ remaining, limit }: { remaining: number; limit: number }) {
  const radius = 34;
  const length = 2 * Math.PI * radius;
  const share = limit > 0 ? remaining / limit : 0;
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx={42} cy={42} r={radius} fill="none" strokeWidth={7} className="stroke-border" />
          <circle
            cx={42}
            cy={42}
            r={radius}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - share)}
            className="stroke-accent"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold">
          {remaining}
          <span className="text-base font-medium text-muted">/{limit}</span>
        </span>
      </div>
      <span className="mt-1.5 text-sm text-muted">analyses restantes</span>
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

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch((err) => setError(messageForError(err)))
      .finally(() => setLoading(false));
  }, []);

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
    return <p className="mx-auto max-w-md px-4 py-16 text-muted">Chargement de votre compte…</p>;
  }

  if (deleted) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Compte supprimé</h1>
        <p role="status" className="mt-3 text-muted">
          Votre compte et les données qui y étaient rattachées ont été effacés. Vous pouvez fermer cette page.
        </p>
        <Link to="/" className={`${SECONDARY_BUTTON} mt-6`}>
          Revenir à l’accueil
        </Link>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Mon compte</h1>
        <p className="mt-3 text-lg text-muted">Connectez-vous pour voir votre abonnement et votre usage.</p>
        {error ? <p role="alert" className="mt-4 text-sm text-criticalInk">{error}</p> : null}
        <Link to="/connexion?next=/compte" className={`${PRIMARY_BUTTON} mt-6`}>
          Se connecter
        </Link>
      </div>
    );
  }

  const view = describeAccount(account);
  const expires = frenchDate(account.planExpiresAt);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 md:py-16">
      <Eyebrow>Votre compte</Eyebrow>
      <h1 className="m-0 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Mon compte</h1>
      <p className="mt-2 mb-0 text-lg break-words text-muted">{account.email}</p>

      {payment === 'ok' ? (
        <p className="mt-6 rounded-control border border-border bg-surface px-4 py-3 text-base">
          {account.plan === 'active'
            ? 'Merci ! Votre abonnement est actif.'
            : 'Merci ! Votre abonnement est en cours d’activation. Actualisez cette page dans un instant.'}
        </p>
      ) : null}
      {payment === 'annule' ? (
        <p className="mt-6 rounded-control border border-border bg-surface px-4 py-3 text-base">
          Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-6 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="m-0 font-mono text-[13px] tracking-[0.16em] text-muted uppercase">Formule</p>
            <h2 className="mt-1 mb-0 font-display text-2xl font-semibold">{view.title}</h2>
            <p className="mt-1 mb-0 text-base text-muted">{view.detail}</p>
            {expires && account.plan === 'active' ? (
              <p className="mt-1 mb-0 text-sm text-muted">Prochaine échéance : {expires}</p>
            ) : null}
          </div>
          <UsageRing remaining={account.usage.remaining} limit={account.usage.limit} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {view.canSubscribe ? (
            <div>
              {/* The express request of art. L221-25 that the conditions of sale rely on. */}
              <label className="mb-3 flex max-w-md items-start gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(event) => setStartNow(event.target.checked)}
                  className="mt-1 accent-accent"
                />
                <span>
                  Je demande que l’abonnement commence dès le paiement. Si je me rétracte dans les 14 jours, je paierai
                  les jours déjà écoulés.
                </span>
              </label>
              <button onClick={subscribe} disabled={busy || !startNow} className={`${PRIMARY_BUTTON} disabled:opacity-60`}>
                {SUBSCRIBE_LABEL}
              </button>
              <p className="mt-2 text-sm text-muted">
                {DAILY_ANALYSES} analyses par jour, sans engagement, renouvelé chaque mois. {VAT_NOTE}.{' '}
                <Link to="/cgv" className="underline hover:text-foreground">
                  Conditions de vente
                </Link>
              </p>
            </div>
          ) : null}
          {view.state === 'active' || view.state === 'quota_exhausted' ? (
            <button onClick={manage} disabled={busy} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
              Gérer ou résilier mon abonnement
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-6 items-center gap-6 rounded-card border border-border bg-surface p-5 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem] sm:p-6">
        <div>
          <h2 className="m-0 font-display text-xl font-semibold">Le bouton Squiggle, sur ordinateur</h2>
          <p className="mt-2 mb-0 text-base text-muted">Reliez-le à ce compte : il analyse l’article ouvert en un clic.</p>
          <Link to="/pont" className={`${SECONDARY_BUTTON} mt-4`}>
            Connecter l’extension
          </Link>
        </div>
        <div className="h-20 max-sm:hidden">
          <BrowserFigure />
        </div>
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
