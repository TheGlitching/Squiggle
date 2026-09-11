import React, { useState } from 'react';
import { describeHostedAccount, type HostedAccount } from '../../hosted/session';
import { ACCOUNT_URL } from '../../hosted/config';

/**
 * The hosted-mode card in the sidepanel: the trial promise when signed out, the
 * entitlement line when signed in, and the Firefox code field. Kept as its own
 * component so `main.tsx` does not grow a second state machine.
 */
export interface HostedAccountCardProps {
  account: HostedAccount | null;
  error: string | null;
  busy: boolean;
  /** Firefox cannot return from the web page by itself, so it shows the code field. */
  showCode: boolean;
  /**
   * Whether hosted mode is the engine analyses currently run through. Only the
   * settings sheet passes this, to offer a signed-in reader the switch back from
   * BYOK. The panel renders this card only when hosted is already active.
   */
  isActive?: boolean;
  onSignIn: () => void;
  onRedeem: (code: string) => void;
  onSignOut: () => void;
  /** Offered beside sign-out when signed in, entitled, and not the active engine. */
  onUseHosted?: () => void;
}

export const HostedAccountCard: React.FC<HostedAccountCardProps> = ({
  account,
  error,
  busy,
  showCode,
  isActive,
  onSignIn,
  onRedeem,
  onSignOut,
  onUseHosted,
}) => {
  const [code, setCode] = useState('');
  const view = account ? describeHostedAccount(account) : null;

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      {account && view ? (
        <>
          <h2 className="text-sm font-semibold text-ink">
            {view.title}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {view.detail}
          </p>
          {/* The quota reads as a bar of pips before it is read as a sentence. */}
          {account.usage.limit > 0 && (
            <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: account.usage.limit }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 rounded-full ${
                    i < account.usage.remaining ? 'bg-accent' : 'bg-line'
                  }`}
                />
              ))}
              <span className="ml-1 font-mono text-[10px] text-muted">
                {account.usage.remaining} / {account.usage.limit}
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!view.canAnalyse && (
              <a
                href={ACCOUNT_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                {view.needsSubscription ? 'S’abonner' : 'Mon compte'}
              </a>
            )}
            {onUseHosted && !isActive && view.canAnalyse && (
              <button
                type="button"
                onClick={onUseHosted}
                disabled={busy}
                className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
              >
                Utiliser l’analyse hébergée
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              disabled={busy}
              className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink/80 disabled:opacity-40 hover:bg-panel-muted"
            >
              Se déconnecter
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-ink">
            3 analyses offertes
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Sans clé d’API : connectez votre compte Squiggle, l’analyse tourne sur nos serveurs.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            disabled={busy}
            className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? 'Ouverture…' : 'Se connecter'}
          </button>
        </>
      )}

      {showCode && !account && (
        <div className="mt-3 rounded-xl bg-panel-muted p-3">
          <label className="block text-xs text-ink/80">
            Sur la page ouverte, demandez un code puis saisissez-le ici&nbsp;:
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoComplete="off"
              placeholder="ABCD2345"
              aria-label="Code de connexion"
              className="mt-2 w-full rounded-xl border border-line bg-ground px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-ink outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => onRedeem(code)}
            disabled={busy || code.trim().length < 4}
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-panel"
          >
            Valider le code
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-severity-critical/15 px-3 py-2 text-xs text-severity-critical-ink"
        >
          {error}
        </p>
      )}
    </div>
  );
};