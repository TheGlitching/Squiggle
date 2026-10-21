import React, { useCallback, useEffect, useState } from 'react';
import {
  hasAllSitesAccess,
  requestAllSitesAccess,
  revokeAllSitesAccess,
} from '../../permissions/siteAccess';

/**
 * The optional "all sites" permission, offered in the settings sheet. Without it
 * Squiggle reads only the page the reader invoked it on; see
 * `src/permissions/siteAccess.ts` for what the grant adds.
 */
export const SiteAccessCard: React.FC = () => {
  const [granted, setGranted] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasAllSitesAccess().then((has) => {
      if (!cancelled) setGranted(has);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const grant = useCallback(async () => {
    const ok = await requestAllSitesAccess();
    setGranted(ok);
    setRefused(!ok);
  }, []);

  const revoke = useCallback(async () => {
    const removed = await revokeAllSitesAccess();
    if (removed) setGranted(false);
  }, []);

  return (
    <section aria-label="Accès aux sites" className="rounded-xl border border-line p-3">
      <h3 className="text-sm font-semibold text-ink">Accès aux sites</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Par défaut, Squiggle ne lit que la page où vous cliquez sur son icône. Autoriser tous les
        sites permet d’analyser une page après avoir changé de site sans recliquer sur l’icône et,
        avec votre propre clé, de vérifier les sources citées par l’article.
      </p>
      {granted ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-severity-positive-ink">Tous les sites autorisés</span>
          <button
            type="button"
            onClick={() => void revoke()}
            className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink/80 hover:bg-panel-muted"
          >
            Retirer l’autorisation
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void grant()}
          className="mt-3 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink hover:bg-panel-muted"
        >
          Autoriser tous les sites
        </button>
      )}
      {refused && (
        <p role="status" className="mt-2 text-xs text-muted">
          Autorisation refusée : Squiggle continue de fonctionner sur la page où vous cliquez sur
          son icône.
        </p>
      )}
    </section>
  );
};
