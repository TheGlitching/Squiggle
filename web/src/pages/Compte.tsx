import { useEffect, useState } from "react";

import {
  getAccount,
  logout,
  messageForError,
  openPortal,
  startCheckout,
  startTeacherCheckout,
  type Account,
} from "../api";
import { DonneesCompte } from "../components/DonneesCompte";
import { DeviceFigure } from "../components/Iso";
import {
  PAGE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TITLE,
} from "../components/Landing";
import { frenchDate } from "../format";
import { MONTHLY_ANALYSES, SUBSCRIBE_LABEL, VAT_NOTE } from "../offer";
import { Link, navigate, usePath } from "../router";
import { describeAccount } from "../usage";

/** What is left in the period, as one bar that fits any quota: the remaining share in violet. */
function Usage({
  remaining,
  limit,
  resetsAt,
}: {
  remaining: number;
  limit: number;
  resetsAt: number | null;
}) {
  const renewal = frenchDate(resetsAt);
  return (
    <div className="w-full sm:w-72">
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">
          {remaining}
        </span>
        <span className="text-base text-muted">
          {remaining > 1 ? "analyses restantes" : "analyse restante"} sur{" "}
          {limit}
        </span>
      </p>
      <div
        role="meter"
        aria-label="Analyses restantes"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={remaining}
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full border border-borderControl"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${limit > 0 ? (remaining / limit) * 100 : 0}%` }}
        />
      </div>
      {renewal ? (
        <p className="mt-2 mb-0 text-sm text-muted">
          Renouvellement le {renewal}
        </p>
      ) : null}
    </div>
  );
}

export function Compte() {
  const path = usePath();
  const params = new URLSearchParams(
    path.includes("?") ? path.slice(path.indexOf("?") + 1) : "",
  );
  const payment = params.get("paiement");

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

  async function goToCheckout(start: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await start();
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
    navigate("/");
  }

  if (loading) {
    return (
      <p className={`${PAGE} py-16 text-muted`}>Chargement de votre compte…</p>
    );
  }

  if (deleted) {
    return (
      <div className={`${PAGE} py-12 md:py-20`}>
        <h1 className={TITLE}>Compte supprimé</h1>
        <p role="status" className="mt-3 text-lg text-muted">
          Votre compte et les données qui y étaient rattachées ont été effacés.
          Vous pouvez fermer cette page.
        </p>
        <Link to="/" className={`${SECONDARY_BUTTON} mt-8`}>
          Revenir à l’accueil
        </Link>
      </div>
    );
  }

  if (!account) {
    return (
      <div className={`${PAGE} py-12 md:py-20`}>
        <h1 className={TITLE}>Mon compte</h1>
        <p className="mt-3 text-lg text-muted">
          Connectez-vous pour voir votre abonnement et votre usage.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-base text-criticalInk">
            {error}
          </p>
        ) : null}
        <Link to="/connexion?next=/compte" className={`${PRIMARY_BUTTON} mt-8`}>
          Se connecter
        </Link>
      </div>
    );
  }

  const view = describeAccount(account);
  const expires = frenchDate(account.planExpiresAt);

  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <div className="max-w-[55ch]">
        <h1 className={TITLE}>Mon compte</h1>
        <p className="mt-3 mb-0 text-lg text-muted">{account.email}</p>

        {payment === "ok" ? (
          <p
            role="status"
            className="mt-6 mb-0 rounded-control border border-border bg-surface px-4 py-3 text-base"
          >
            {account.plan === "active"
              ? "Merci ! Votre abonnement est actif."
              : "Merci ! Votre abonnement est en cours d’activation. Actualisez cette page dans un instant."}
          </p>
        ) : null}
        {payment === "annule" ? (
          <p
            role="status"
            className="mt-6 mb-0 rounded-control border border-border bg-surface px-4 py-3 text-base"
          >
            Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-6 mb-0 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk"
          >
            {error}
          </p>
        ) : null}

        <section
          aria-labelledby="formule-titre"
          className="mt-12 border-t border-lineSoft pt-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div>
              <h2
                id="formule-titre"
                className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]"
              >
                {view.title}
              </h2>
              <p className="mt-1 mb-0 text-base text-muted">{view.detail}</p>
              {expires && account.plan === "active" ? (
                <p className="mt-1 mb-0 text-base text-muted">
                  Prochaine échéance : {expires}
                </p>
              ) : null}
            </div>
            <Usage
              remaining={account.usage.remaining}
              limit={account.usage.limit}
              resetsAt={account.usage.resetsAt}
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {view.canSubscribe && account.teacherOffer ? (
              <div>
                <button
                  onClick={() => goToCheckout(startTeacherCheckout)}
                  disabled={busy}
                  className={`${PRIMARY_BUTTON} max-sm:w-full disabled:opacity-50`}
                >
                  Accès enseignant
                </button>
                <p className="mt-3 mb-0 max-w-xl text-sm text-muted">
                  Votre adresse académique vous ouvre l’abonnement complet,
                  gratuit jusqu’au 30 juin : {MONTHLY_ANALYSES} analyses par
                  mois, sans carte bancaire. Il s’arrête de lui-même à cette
                  date.
                </p>
              </div>
            ) : view.canSubscribe ? (
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
                    Je demande que l’abonnement commence dès le paiement. Si je
                    me rétracte dans les 14 jours, je paierai les jours déjà
                    écoulés.
                  </span>
                </label>
                <button
                  onClick={() => goToCheckout(startCheckout)}
                  disabled={busy || !startNow}
                  className={`${PRIMARY_BUTTON} max-sm:w-full disabled:opacity-50`}
                >
                  {SUBSCRIBE_LABEL}
                </button>
                <p className="mt-3 mb-0 text-sm text-muted">
                  {MONTHLY_ANALYSES} analyses par mois, sans engagement,
                  renouvelé chaque mois. {VAT_NOTE}.{" "}
                  <Link
                    to="/cgv"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Conditions de vente
                  </Link>
                </p>
              </div>
            ) : null}
            {view.state === "active" || view.state === "quota_exhausted" ? (
              <button
                onClick={manage}
                disabled={busy}
                className={`${SECONDARY_BUTTON} max-sm:w-full disabled:opacity-60`}
              >
                Gérer ou résilier mon abonnement
              </button>
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="extension-titre"
          className="mt-12 grid items-center gap-x-10 gap-y-4 border-t border-lineSoft pt-10 sm:grid-cols-[minmax(0,1fr)_12rem]"
        >
          <div>
            <h2
              id="extension-titre"
              className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]"
            >
              Le bouton dans votre navigateur
            </h2>
            <p className="mt-2 mb-0 text-base text-muted">
              Pour analyser d’un clic l’article ouvert dans Chrome ou Firefox,
              connectez l’extension à ce compte.
            </p>
            <Link
              to="/pont"
              className={`${SECONDARY_BUTTON} mt-5 max-sm:w-full`}
            >
              Connecter l’extension
            </Link>
          </div>
          <div className="max-sm:hidden">
            <DeviceFigure device="navigateur" />
          </div>
        </section>

        <DonneesCompte
          account={account}
          onSignOut={signOut}
          onEmailChanged={(email) =>
            setAccount((current) => (current ? { ...current, email } : current))
          }
          onDeleted={() => {
            setAccount(null);
            setDeleted(true);
          }}
        />
      </div>
    </div>
  );
}
