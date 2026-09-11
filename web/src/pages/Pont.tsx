import { useEffect, useMemo, useState } from 'react';

import {
  claimExtension,
  getAccount,
  issueBridgeCode,
  messageForError,
  type Account,
} from '../api';
import { buildExtensionAuthUrl, parseBridgeJwk, parseBridgeQuery } from '../bridge';
import { Link, usePath } from '../router';

export function Pont() {
  const path = usePath();
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  const params = useMemo(() => parseBridgeQuery(search), [search]);

  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'working' | 'code' | 'error'>('idle');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  // Signed in: claim a token and hand it to the extension. Chromium accepts
  // the navigation; Firefox does not, which is what the code fallback is for.
  useEffect(() => {
    if (!params || !account || status !== 'idle') return;
    const jwk = parseBridgeJwk(params.pub);
    if (!jwk) {
      setError('Le lien de connexion est incomplet. Relancez la connexion depuis l’extension.');
      setStatus('error');
      return;
    }
    setStatus('working');
    claimExtension(jwk)
      .then(({ token, keyId }) => {
        window.location.href = buildExtensionAuthUrl(params.ext, token, params.pub, keyId);
      })
      .catch((err) => {
        setError(messageForError(err));
        setStatus('error');
      });
  }, [params, account, status]);

  async function requestCode() {
    if (!params) return;
    const jwk = parseBridgeJwk(params.pub);
    if (!jwk) {
      setError('Le lien de connexion est incomplet. Relancez la connexion depuis l’extension.');
      setStatus('error');
      return;
    }
    setError(null);
    try {
      const issued = await issueBridgeCode(jwk);
      setCode(issued.code);
      setStatus('code');
    } catch (err) {
      setError(messageForError(err));
      setStatus('error');
    }
  }

  if (!params) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Connecter l’extension</h1>
        <p className="mt-3 text-muted">
          Cette page relie l’extension à votre compte. Ouvrez l’extension dans votre navigateur et
          cliquez sur « Se connecter » : elle vous amènera ici avec tout ce qu’il faut.
        </p>
        <Link
          to="/compte"
          className="mt-6 inline-block rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
        >
          Retour à mon compte
        </Link>
      </div>
    );
  }

  if (account === undefined) {
    return <p className="mx-auto max-w-lg px-5 py-16 text-muted">Chargement…</p>;
  }

  if (account === null) {
    const next = encodeURIComponent(path);
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Connectez-vous d’abord</h1>
        <p className="mt-3 text-muted">
          L’extension utilise votre compte Squiggle. Connectez-vous, puis la connexion reprendra
          automatiquement.
        </p>
        <Link
          to={`/connexion?next=${next}`}
          className="mt-6 inline-block rounded-lg bg-accent px-5 py-3 font-medium text-white hover:bg-accentHover"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Connexion de l’extension</h1>

      {status === 'code' && code ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Dans l’extension, choisissez « J’ai un code » et saisissez :
          </p>
          <p className="mt-4 font-mono text-4xl font-semibold tracking-[0.35em] text-accent">
            {code}
          </p>
          <p className="mt-4 text-xs text-faint">
            Ce code est valable 10 minutes et ne sert qu’une fois.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-muted">
          {status === 'error'
            ? 'La connexion automatique n’a pas abouti.'
            : 'Connexion en cours… si une fenêtre de l’extension s’ouvre, tout est réglé.'}
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-accent bg-accentSoft px-4 py-3 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="font-display text-lg font-semibold">
          L’extension ne s’ouvre pas&nbsp;? (Firefox)
        </h2>
        <p className="mt-2 text-sm text-muted">
          Firefox n’autorise pas l’ouverture automatique de l’extension. Demandez un code et saisissez-le
          dans l’extension.
        </p>
        <button
          onClick={requestCode}
          className="mt-4 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
        >
          Afficher un code à saisir
        </button>
      </div>
    </div>
  );
}
