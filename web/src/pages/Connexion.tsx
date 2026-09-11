import { useEffect, useState, type FormEvent } from 'react';

import { getAccount, googleSignInUrl, messageForError, requestMagicLink, verifyMagicLink } from '../api';
import { navigate, Link, usePath } from '../router';

function searchOf(path: string): URLSearchParams {
  return new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
}

export function Connexion() {
  const path = usePath();
  const params = searchOf(path);
  const next = params.get('next') ?? '/compte';
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
    verifyMagicLink(linkCode)
      .then(() => {
        if (!cancelled) navigate(next);
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
      await requestMagicLink(email);
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
      await verifyMagicLink(code);
      navigate(next);
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-3 text-muted">
        Entrez votre adresse e-mail : vous recevez un code et un lien de connexion. Pas de mot de
        passe à retenir.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-accent bg-accentSoft px-4 py-3 text-sm text-accentInk">
          {error}
        </p>
      ) : null}

      {busy && step === 'email' && linkCode ? (
        <p className="mt-6 text-muted">Connexion en cours…</p>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={submitEmail} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Adresse e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-borderControl bg-surface px-3.5 py-2.5 outline-none focus:border-accent"
              placeholder="vous@exemple.fr"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accentForeground hover:bg-accentHover disabled:opacity-60"
          >
            Recevoir mon code
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-8 space-y-4">
          <p className="text-sm text-muted">
            Saisissez le code à 8 caractères reçu par e-mail, ou ouvrez le lien depuis ce message. Il
            est valable 10 minutes.
          </p>
          <label className="block">
            <span className="text-sm font-medium">Code de connexion</span>
            <input
              type="text"
              required
              inputMode="text"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1.5 w-full rounded-lg border border-borderControl bg-surface px-3.5 py-2.5 font-mono text-lg tracking-[0.3em] outline-none focus:border-accent"
              placeholder="ABCD2345"
              maxLength={12}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accentForeground hover:bg-accentHover disabled:opacity-60"
          >
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setError(null);
            }}
            className="w-full text-sm text-muted hover:text-foreground"
          >
            Utiliser une autre adresse
          </button>
        </form>
      )}

      <div className="my-8 flex items-center gap-3 text-xs uppercase tracking-widest text-faint">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <a
        href={googleSignInUrl()}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 font-medium hover:border-accent hover:text-accentInk"
      >
        Continuer avec Google
      </a>

      <p className="mt-8 text-xs text-muted">
        En vous connectant, vous acceptez les{' '}
        <Link to="/legal" className="underline hover:text-foreground">
          conditions et la politique de confidentialité
        </Link>
        . Aucune publicité, aucun traceur.
      </p>
    </div>
  );
}
