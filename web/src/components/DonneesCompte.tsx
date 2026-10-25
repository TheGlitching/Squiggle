/**
 * "Données et compte": the three rights `PRIVACY.md` promises that a reader
 * exercises from here - change the address, revoke an install, erase the
 * account. Deletion sits last, apart, behind a confirmation that names what
 * goes.
 */
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  confirmEmailChange,
  deleteAccount,
  listInstalls,
  messageForError,
  requestEmailChange,
  revokeInstall,
  type Account,
  type Install,
} from '../api';
import { frenchDate } from '../format';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './Landing';
import { Link } from '../router';

const inputClass =
  'mt-2 block w-full rounded-control border border-borderControl bg-surface px-4 py-3 text-base outline-hidden focus:border-accentHover';
const secondaryButton = `${SECONDARY_BUTTON} disabled:opacity-60`;
const primaryButton = `${PRIMARY_BUTTON} disabled:opacity-60`;

interface Props {
  account: Account;
  onSignOut: () => void;
  onEmailChanged: (email: string) => void;
  onDeleted: () => void;
}

export function DonneesCompte({ account, onSignOut, onEmailChanged, onDeleted }: Props) {
  return (
    <section aria-labelledby="donnees-titre" className="mt-12 border-t border-lineSoft pt-10">
      <h2 id="donnees-titre" className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]">
        Données et compte
      </h2>
      <p className="mt-2 text-base text-muted">
        Voir{' '}
        <Link to="/transparence" className="underline hover:text-foreground">
          le détail du trajet des données
        </Link>
        .
      </p>

      <EmailBlock email={account.email} onChanged={onEmailChanged} />
      <InstallsBlock />

      <div className="mt-8 border-t border-border pt-6">
        <button onClick={onSignOut} className="text-base text-muted underline hover:text-foreground">
          Se déconnecter
        </button>
      </div>

      <DeleteBlock onDeleted={onDeleted} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

function pendingCodeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('email-code') ?? '';
}

function EmailBlock({ email, onChanged }: { email: string | null; onChanged: (email: string) => void }) {
  // A code in the URL is the emailed link: open straight on the code step.
  const [initialCode] = useState(pendingCodeFromUrl);
  const [step, setStep] = useState<'idle' | 'address' | 'code'>(initialCode ? 'code' : 'idle');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestEmailChange(newEmail);
      setNotice(null);
      setStep('code');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const done = await confirmEmailChange(code);
      onChanged(done.email);
      setNotice(`Votre adresse est maintenant ${done.email}.`);
      setStep('idle');
      setCode('');
      setNewEmail('');
      // The emailed link is spent: do not leave its code in the address bar.
      window.history.replaceState({}, '', '/compte');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setStep('idle');
    setError(null);
  }

  return (
    <div className="mt-8">
      <h3 className="m-0 font-display text-lg font-semibold">Adresse e-mail</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted">{email ?? 'Aucune adresse enregistrée.'}</p>
        {step === 'idle' ? (
          <button
            onClick={() => {
              setNotice(null);
              setStep('address');
            }}
            className={secondaryButton}
          >
            Changer d’adresse e-mail
          </button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="mt-3 text-base text-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk">
          {error}
        </p>
      ) : null}

      {step === 'address' ? (
        <form onSubmit={sendCode} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-base font-medium">Nouvelle adresse e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputClass}
              placeholder="vous@exemple.fr"
            />
          </label>
          <p className="text-sm text-muted">
            Nous envoyons un code à cette adresse. Votre adresse actuelle reste active tant que vous ne l’avez
            pas confirmé.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Envoi…' : 'Envoyer le code'}
            </button>
            <button type="button" onClick={cancel} className={secondaryButton}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {step === 'code' ? (
        <form onSubmit={confirm} className="mt-4 space-y-3">
          <p className="text-base text-muted">
            {newEmail
              ? `Si ${newEmail} est disponible, un code vient d’y être envoyé. `
              : 'Saisissez le code reçu à la nouvelle adresse. '}
            Il est valable 10 minutes.
          </p>
          <label className="block">
            <span className="text-base font-medium">Code de confirmation</span>
            <input
              type="text"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`${inputClass} font-mono text-lg tracking-[0.3em]`}
              placeholder="ABCD2345"
              maxLength={12}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Confirmation…' : 'Confirmer l’adresse'}
            </button>
            <button type="button" onClick={cancel} className={secondaryButton}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Installs
// ---------------------------------------------------------------------------

function InstallsBlock() {
  const [installs, setInstalls] = useState<Install[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listInstalls()
      .then(setInstalls)
      .catch((err) => {
        setError(messageForError(err));
        setInstalls([]);
      });
  }, []);

  async function revoke(install: Install) {
    setBusyId(install.id);
    setError(null);
    setNotice(null);
    try {
      await revokeInstall(install.id);
      setNotice('Extension révoquée : elle devra se reconnecter pour analyser à nouveau.');
    } catch (err) {
      // Already revoked from another tab: the list below is the truth now.
      if (err instanceof ApiError && err.code === 'not_found') {
        setNotice('Cette extension était déjà révoquée.');
      } else {
        setError(messageForError(err));
        setBusyId(null);
        return;
      }
    }
    setInstalls((current) => (current ?? []).filter((i) => i.id !== install.id));
    setBusyId(null);
  }

  return (
    <div className="mt-8">
      <h3 className="m-0 font-display text-lg font-semibold">Extensions connectées</h3>
      <p className="mt-1 text-base text-muted">
        Chaque extension connectée à votre compte peut lancer des analyses à votre nom. Révoquez celle que vous
        ne reconnaissez pas ou dont vous n’avez plus l’usage.
      </p>

      {notice ? (
        <p role="status" className="mt-3 text-base text-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk">
          {error}
        </p>
      ) : null}

      {installs === null ? (
        <p className="mt-3 text-base text-muted">Chargement…</p>
      ) : installs.length === 0 ? (
        <p className="mt-3 text-base text-muted">Aucune extension connectée.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {installs.map((install) => {
            const since = frenchDate(install.createdAt);
            return (
              <li key={install.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-base">Extension connectée le {since}</p>
                  <p className="text-sm text-faint">Valable jusqu’au {frenchDate(install.expiresAt)}</p>
                </div>
                <button
                  onClick={() => revoke(install)}
                  disabled={busyId !== null}
                  aria-label={`Révoquer l’extension connectée le ${since}`}
                  className={secondaryButton}
                >
                  {busyId === install.id ? 'Révocation…' : 'Révoquer'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

function DeleteBlock({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onDeleted();
    } catch (err) {
      // The server cancels the subscription before it erases anything, and
      // refuses to go on when it cannot: nothing was deleted, and saying so
      // is what lets the reader retry instead of wondering.
      setError(
        err instanceof ApiError && err.code === 'billing_unavailable'
          ? 'Votre abonnement n’a pas pu être résilié : votre compte n’a pas été supprimé. Réessayez dans un moment.'
          : messageForError(err),
      );
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-card border border-critical/70 p-6">
      <h3 className="m-0 font-display text-lg font-semibold text-criticalInk">Supprimer mon compte</h3>

      {!open ? (
        <>
          <p className="mt-1 text-base text-muted">Efface votre compte et les données qui y sont rattachées.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex min-h-12 items-center rounded-control border border-critical px-5 py-3 text-base font-medium text-criticalInk hover:bg-criticalSoft"
          >
            Supprimer mon compte…
          </button>
        </>
      ) : (
        <div role="group" aria-labelledby="suppression-titre" className="mt-1">
          <p id="suppression-titre" className="text-base font-medium">
            Supprimer définitivement votre compte ?
          </p>
          <p className="mt-2 text-base text-muted">Sont effacés, sans possibilité de retour :</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-muted">
            <li>votre compte et votre adresse e-mail ;</li>
            <li>vos extensions connectées, qui cesseront de fonctionner ;</li>
            <li>vos sessions ouvertes sur ce site ;</li>
            <li>votre journal d’usage et votre compteur d’analyses.</li>
          </ul>
          <p className="mt-2 text-base text-muted">
            Un abonnement en cours est résilié immédiatement. Les rapports déjà partagés ne sont pas
            rattachés à vous et ne sont pas concernés.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={erase} disabled={busy} className={primaryButton}>
              {busy ? 'Suppression…' : 'Supprimer définitivement mon compte'}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={busy}
              autoFocus
              className={secondaryButton}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
