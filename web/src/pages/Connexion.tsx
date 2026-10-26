import { useEffect, useState, type FormEvent } from 'react';

import { getAccount, googleSignInUrl, messageForError, requestMagicLink, verifyMagicLink } from '../api';
import { isStandalone } from '../install';
import { StepFigure } from '../components/Iso';
import { FIELD, PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { FREE_ANALYSES } from '../offer';
import { navigate, Link, usePath } from '../router';

function searchOf(path: string): URLSearchParams {
  return new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
}

export function Connexion() {
  const path = usePath();
  const params = searchOf(path);
  const requestedNext = params.get('next');
  const next = requestedNext ?? '/compte';
  const linkCode = params.get('code');

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A code in the URL is the emailed link: verify it straight away.
  useEffect(() => {
    if (!linkCode) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    // The emailed link opens in a new tab that has lost the page which asked
    // for the sign-in, so the destination comes back from the server.
    verifyMagicLink(linkCode)
      .then((result) => {
        if (!cancelled) navigate(result.next ?? next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(messageForError(err));
        setStep('code');
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // `next` is stable for a given URL; re-running on it would re-verify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  // Already signed in: skip the form.
  useEffect(() => {
    if (linkCode) return;
    getAccount()
      .then((account) => {
        if (account) navigate(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email, requestedNext ?? undefined);
      setStep('code');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await verifyMagicLink(code);
      navigate(result.next ?? next);
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  return (
    <div className={`${PAGE} grid gap-14 py-12 md:py-20 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-24`}>
      <div>
        <h1 className={TITLE}>Se connecter</h1>
        <p className="mt-3 mb-0 text-lg text-muted">Un code par e-mail. Pas de mot de passe.</p>

        {error ? (
          <p
            role="alert"
            className="mt-6 mb-0 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk"
          >
            {error}
          </p>
        ) : null}

        {busy && step === 'email' && linkCode ? <p className="mt-6 mb-0 text-muted">Connexion en cours…</p> : null}

        {step === 'email' ? (
          <form onSubmit={submitEmail} className="mt-8 grid gap-4">
            <label className="block">
              <span className="text-base font-medium">Adresse e-mail</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
                placeholder="vous@exemple.fr"
              />
            </label>
            <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} w-full disabled:opacity-60`}>
              Recevoir mon code
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-8 grid gap-4">
            <p className="m-0 text-base text-muted">
              {/* The installed app keeps its own cookies on iOS: a link tapped in Mail
                  signs Safari in, not the app, so only the code works here. */}
              {isStandalone()
                ? 'Saisissez ici le code à 8 caractères reçu par e-mail, plutôt que de toucher le lien : il s’ouvrirait dans le navigateur, pas dans l’application. Le code est valable 10 minutes.'
                : 'Saisissez le code à 8 caractères reçu par e-mail, ou ouvrez le lien depuis ce message. Il est valable 10 minutes.'}
            </p>
            <label className="block">
              <span className="text-base font-medium">Code de connexion</span>
              <input
                type="text"
                required
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={`${FIELD} font-mono text-lg tracking-[0.3em]`}
                placeholder="ABCD2345"
                maxLength={12}
              />
            </label>
            <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} w-full disabled:opacity-60`}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              className="min-h-11 w-full text-base text-muted hover:text-foreground"
            >
              Utiliser une autre adresse
            </button>
          </form>
        )}

        <div className="my-8 flex items-center gap-3 text-base text-muted">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>

        <a href={googleSignInUrl(requestedNext ?? undefined)} className={`${SECONDARY_BUTTON} w-full`}>
          Continuer avec Google
        </a>

        <p className="mt-8 mb-0 text-sm leading-relaxed text-muted">
          En vous connectant, vous acceptez les{' '}
          <Link to="/conditions" className="underline underline-offset-4 hover:text-foreground">
            conditions d’utilisation
          </Link>{' '}
          et la{' '}
          <Link to="/confidentialite" className="underline underline-offset-4 hover:text-foreground">
            politique de confidentialité
          </Link>
          . Aucune publicité, aucun traceur.
        </p>
      </div>

      {/* What a new account opens: the offer, and what an analysis gives back. */}
      <aside
        aria-label="Ce que vous obtenez"
        className="grid content-start gap-6 max-lg:border-t max-lg:border-lineSoft max-lg:pt-12"
      >
        <div className="max-w-80">
          <StepFigure step="rapport" />
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 text-lg">
          <li>{FREE_ANALYSES} analyses offertes, sans carte bancaire.</li>
          <li className="text-muted">Un compte pour le site, l’appli et l’extension.</li>
        </ul>
      </aside>
    </div>
  );
}
