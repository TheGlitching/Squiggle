/**
 * Signing in without a password: an e-mail becomes a code (and a link), the
 * code becomes a session cookie; or Google does it in one step. Shared by the
 * sign-in page and the analysis page, where it opens in place so a pasted
 * text never leaves the screen.
 */
import { useState, type FormEvent } from 'react';

import { googleSignInUrl, messageForError, requestMagicLink, verifyMagicLink } from '../api';
import { isStandalone } from '../install';
import { Link } from '../router';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './Landing';

const FIELD =
  'mt-2 block w-full rounded-control border border-borderControl bg-surface px-4 py-3 text-base text-foreground outline-hidden transition-colors duration-160 ease-out placeholder:text-muted focus:border-accentHover';

export function SignIn({
  next,
  onSignedIn,
  error: outerError = null,
  initialStep = 'email',
}: {
  /** Where the emailed link should land, kept by the server with the code. */
  next?: string;
  /** Called once the session exists, with the destination the server kept, if any. */
  onSignedIn: (next: string | null) => void;
  error?: string | null;
  /** `code` when an emailed link failed: the reader can still type its code. */
  initialStep?: 'email' | 'code';
}) {
  const [step, setStep] = useState<'email' | 'code'>(initialStep);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = error ?? outerError;

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email, next);
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
      onSignedIn(result.next ?? null);
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {shown ? (
        <p role="alert" className="m-0 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-sm text-criticalInk">
          {shown}
        </p>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={submitEmail} className="grid gap-4">
          <label className="block">
            <span className="text-base font-medium">Adresse e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              placeholder="vous@exemple.fr"
            />
          </label>
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} w-full`}>
            Recevoir mon code
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="grid gap-4">
          <p className="m-0 text-base leading-relaxed text-muted">
            {/* The installed app keeps its own cookies on iOS: a link tapped in Mail
                signs Safari in, not the app, so only the code works here. */}
            {email ? `Code envoyé à ${email}. ` : ''}
            {isStandalone()
              ? 'Saisissez-le ici : le lien de l’e-mail s’ouvrirait dans le navigateur, pas dans l’appli.'
              : 'Saisissez le code reçu, ou ouvrez le lien de l’e-mail. Il vaut 10 minutes.'}
          </p>
          <label className="block">
            <span className="text-base font-medium">Code de connexion</span>
            <input
              type="text"
              required
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`${FIELD} font-mono text-xl tracking-[0.3em]`}
              placeholder="ABCD2345"
              maxLength={12}
            />
          </label>
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} w-full`}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setError(null);
            }}
            className="justify-self-start py-2 text-base text-muted underline underline-offset-4 hover:text-foreground"
          >
            Utiliser une autre adresse
          </button>
        </form>
      )}

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <a href={googleSignInUrl(next)} className={`${SECONDARY_BUTTON} w-full`}>
        <svg viewBox="0 0 18 18" aria-hidden="true" className="h-[18px] w-[18px]">
          <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
          <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
        </svg>
        Continuer avec Google
      </a>

      <p className="m-0 text-sm leading-relaxed text-muted">
        En vous connectant, vous acceptez les{' '}
        <Link to="/conditions" className="underline underline-offset-4 hover:text-foreground">
          conditions d’utilisation
        </Link>{' '}
        et la{' '}
        <Link to="/confidentialite" className="underline underline-offset-4 hover:text-foreground">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}
