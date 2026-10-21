import { useEffect, useState } from 'react';

import { getAccount, logout, messageForError, openPortal, startCheckout, type Account } from '../api';
import { DonneesCompte } from '../components/DonneesCompte';
import { frenchDate } from '../format';
import { Link, navigate, usePath } from '../router';
import { describeAccount } from '../usage';

export function Compte() {
  const path = usePath();
  const params = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
  const payment = params.get('paiement');

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

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
    return <p className="mx-auto max-w-md px-5 py-16 text-muted">Chargement de votre compte…</p>;
  }

  if (deleted) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Compte supprimé</h1>
        <p role="status" className="mt-3 text-muted">
          Votre compte et les données qui y étaient rattachées ont été effacés. Vous pouvez fermer cette page.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg border border-border bg-surface px-5 py-3 font-medium hover:border-accent hover:text-accentInk"
        >
          Revenir à l’accueil
        </Link>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mon compte</h1>
        <p className="mt-3 text-muted">Connectez-vous pour voir votre abonnement et votre usage.</p>
        {error ? <p role="alert" className="mt-4 text-sm text-accent">{error}</p> : null}
        <Link
          to="/connexion?next=/compte"
          className="mt-6 inline-block rounded-lg bg-accent px-5 py-3 font-medium text-accentForeground hover:bg-accentHover"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const view = describeAccount(account);
  const expires = frenchDate(account.planExpiresAt);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Mon compte</h1>
      <p className="mt-2 text-muted">{account.email}</p>

      {payment === 'ok' ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          Merci ! Votre abonnement est en cours d’activation. Cette page se met à jour dans un
          instant.
        </p>
      ) : null}
      {payment === 'annule' ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-accent bg-accentSoft px-4 py-3 text-sm text-accentInk">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Formule</p>
            <h2 className="mt-1 font-display text-xl font-semibold">{view.title}</h2>
            <p className="mt-1 text-sm text-muted">{view.detail}</p>
            {expires && account.plan === 'active' ? (
              <p className="mt-1 text-xs text-faint">Prochaine échéance : {expires}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-serif text-3xl font-semibold text-accent">
              {account.usage.remaining}
              <span className="text-base text-muted"> / {account.usage.limit}</span>
            </p>
            <p className="text-xs text-muted">analyses restantes</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {view.needsSubscription ? (
            <button
              onClick={subscribe}
              disabled={busy}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-accentForeground hover:bg-accentHover disabled:opacity-60"
            >
              S’abonner — 10 analyses / jour
            </button>
          ) : null}
          {view.state === 'active' || view.state === 'quota_exhausted' ? (
            <button
              onClick={manage}
              disabled={busy}
              className="rounded-lg border border-border bg-background px-5 py-2.5 font-medium hover:border-accent hover:text-accentInk disabled:opacity-60"
            >
              Gérer ou résilier mon abonnement
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">Connecter l’extension</h2>
        <p className="mt-2 text-sm text-muted">
          L’extension analyse les articles dans votre navigateur. Connectez-la pour que les analyses
          tournent sur nos serveurs, sans clé d’API.
        </p>
        <Link
          to="/pont"
          className="mt-4 inline-block rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:border-accent hover:text-accentInk"
        >
          Connecter l’extension
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
