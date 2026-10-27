/**
 * The owner's metrics page (/tableau): the figures `GET /admin/metrics` computes,
 * read from a phone with the owner's own web session (`GET /web/tableau`).
 *
 * The build writes no page for this address, so it is served as the 404, and to
 * anyone the server does not recognise as the owner it stays exactly that: the
 * page shows `fallback`, the 404, until the server has answered with the figures.
 * Nothing links here, no search indexes it, and it counts no audience. Visits are
 * not here: Cloudflare Web Analytics reads them, and the page links to it.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { getOwnerMetrics, messageForError, type OwnerMetrics } from '../api';
import { FIELD, H3, PAGE, QUIET_LINK, TITLE } from '../components/Landing';
import { Layout } from '../components/Layout';

const WINDOWS = [1, 4, 12] as const;

/** Visits are counted there, at the edge, without a cookie. */
const CLOUDFLARE_WEB_ANALYTICS = 'https://dash.cloudflare.com/?to=/:account/web-analytics';

const LABELS: Record<string, string> = {
  // clicks
  install_chrome: 'Installer (Chrome)',
  install_firefox: 'Installer (Firefox)',
  teacher_access: 'Accès enseignant',
  subscribe: 'S’abonner',
  example: 'Exemple',
  // pastes
  transcript: 'Transcription de vidéo',
  // reported findings: categories, then reasons
  sophisme: 'Sophisme',
  affirmation_non_etayee: 'Affirmation non étayée',
  surinterpretation: 'Surinterprétation',
  source_absente: 'Source absente',
  cadrage: 'Cadrage',
  point_fort: 'Point fort',
  misread: 'Le passage ne dit pas cela',
  sourced: 'L’article donne sa source',
  wrong_kind: 'Ce n’est pas ce procédé',
  too_harsh: 'Trop sévère',
  other: 'Autre raison',
  // sign-in
  link_sent: 'Lien envoyé',
  google: 'Google',
  completed: 'Connexions réussies',
  after_anon: 'Comptes créés après une analyse sans compte',
  // checkout
  started: 'Commencés',
  paid: 'Payés',
  free: 'Offerts',
  // surfaces
  install: 'Extension',
  session: 'Site',
  anon: 'Site, sans compte',
  video: 'dont vidéos YouTube',
  // refusals
  trial_exhausted: 'Essai épuisé',
  quota_exhausted: 'Quota épuisé',
  starts_exhausted: 'Trop de lancements',
  article_too_long: 'Article trop long',
  subscription_required: 'Abonnement requis',
  anon_used: 'Sans compte : déjà faite ce jour',
  anon_closed: 'Sans compte : plafond du jour atteint',
};

// A figure the server left out reads as '-' rather than taking the whole page down.
const number = (n: number | undefined) => (n == null ? '-' : n.toLocaleString('fr-FR'));
const percent = (share: number | null | undefined) =>
  share == null ? '-' : share.toLocaleString('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const usd = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

function Tile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <p className="m-0 text-sm text-muted">{label}</p>
      <p className="m-0 mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children ? <p className="m-0 mt-2 text-sm text-muted">{children}</p> : null}
    </div>
  );
}

/** One group of counts, largest first, each with a bar against the group's largest; zeros are left out. */
function Counts({ title, counts }: { title: string; counts: Record<string, number> }) {
  const rows = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div>
      <h3 className={`${H3} text-base`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="m-0 mt-2 text-sm text-muted">Rien sur la période.</p>
      ) : (
        <dl className="m-0 mt-2">
          {rows.map(([key, n]) => (
            <div key={key} className="border-b border-lineSoft py-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm">{LABELS[key] ?? key}</dt>
                <dd className="m-0 text-sm tabular-nums">{number(n)}</dd>
              </div>
              <div className="mt-1 h-1 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Rows({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div>
      <h3 className={`${H3} text-base`}>{title}</h3>
      <dl className="m-0 mt-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-lineSoft py-2">
            <dt className="text-sm">{label}</dt>
            <dd className="m-0 text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Band({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="m-0 font-display text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-4 grid gap-8 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Figures({ m }: { m: OwnerMetrics }) {
  const h = m.headline;
  const stage = (label: string, s: { calls: number; failed: number; failureRate: number | null }) =>
    [label, `${number(s.failed)} / ${number(s.calls)} · ${percent(s.failureRate)}`] as [string, string];
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Nouveaux comptes" value={number(h.newAccounts.count)}>
          {number(h.activeAccounts)} comptes actifs
        </Tile>
        <Tile label="Première analyse dans la semaine" value={percent(h.activationWithinWeek.share)}>
          {number(h.activationWithinWeek.activated)} sur {number(h.activationWithinWeek.cohort)} comptes
        </Tile>
        <Tile label="Abonnés payants" value={number(h.subscribers.paying)}>
          {number(h.subscribers.free)} accès offerts · {number(h.subscribers.cancelled)} résiliations
        </Tile>
        <Tile label="Analyses réussies" value={percent(h.successRate.share)}>
          {number(h.successRate.finalized)} sur {number(h.successRate.started)} ·{' '}
          {h.aiCost.costPerAnalysisUsd === null ? 'coût : indiquez la facture' : `${usd(h.aiCost.costPerAnalysisUsd)} par analyse`}
        </Tile>
      </div>

      <Band title="Campagnes, boutons, textes collés">
        <Counts title="Campagnes" counts={m.audience.campaigns} />
        <Counts title="Boutons" counts={m.audience.clicks} />
        <Counts title="Textes collés" counts={m.audience.pastes ?? {}} />
      </Band>

      {/* An older server leaves the band out rather than blanking the page. */}
      <Band title="Constats signalés comme erronés">
        <Counts title="Par catégorie" counts={m.audience.flags?.categories ?? {}} />
        <Counts title="Par motif" counts={m.audience.flags?.reasons ?? {}} />
      </Band>

      <Band title="Entonnoir">
        <Counts title="Connexion" counts={m.funnel.signin} />
        <Counts title="Paiement" counts={m.funnel.checkout} />
        <Counts title="Analyses lancées" counts={m.funnel.runsStarted} />
        <Counts title="Analyses réussies" counts={m.funnel.finalized} />
        <Counts title="Analyses refusées" counts={m.funnel.refused} />
        <Rows
          title="Analyse sans compte"
          rows={[
            ['Lancées', number(m.funnel.runsStarted.anon)],
            ['Réussies', number(m.funnel.finalized.anon)],
            ['Refusées : déjà faite ce jour', number(m.funnel.refused.anon_used)],
            ['Refusées : plafond du jour atteint', number(m.funnel.refused.anon_closed)],
            ['Comptes créés ensuite', number(m.funnel.signin.after_anon)],
          ]}
        />
      </Band>

      <Band title="Santé">
        <Rows
          title="Échecs par étape"
          rows={[
            stage('Audit', m.stages.audit),
            ['Audits tronqués', number(m.stages.audit.truncated)],
            stage('Recherche', m.stages.research),
            stage('Sources citées', m.stages.sourceCheck),
          ]}
        />
        <Rows
          title="Cache partagé"
          rows={[
            ['Vérifications', number(m.cache.checks)],
            ['Rapports servis du cache', number(m.cache.hits)],
            ['Taux de succès', percent(m.cache.hitRate)],
          ]}
        />
      </Band>
    </>
  );
}

export function Pilotage({ fallback }: { fallback: ReactNode }) {
  const [weeks, setWeeks] = useState<number>(1);
  const [cost, setCost] = useState('');
  const [metrics, setMetrics] = useState<OwnerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const costUsd = cost.trim() === '' ? undefined : Number(cost.replace(',', '.'));
  const costValid = costUsd === undefined || (Number.isFinite(costUsd) && costUsd >= 0);

  useEffect(() => {
    if (!costValid) return;
    let live = true;
    getOwnerMetrics(weeks, costUsd).then(
      (m) => {
        if (!live) return;
        setMetrics(m);
        setError(null);
        if (m) document.title = 'Tableau de bord - Squiggle';
      },
      (err) => {
        if (live) setError(messageForError(err));
      },
    );
    return () => {
      live = false;
    };
  }, [weeks, costUsd, costValid]);

  // Until the server has said this is the owner, this is the 404, whatever went wrong.
  if (!metrics) return <>{fallback}</>;

  return (
    <Layout account="Mon compte">
      <div className={`${PAGE} py-10 md:py-16`}>
        <h1 className={TITLE}>Tableau de bord</h1>
        <div role="group" aria-label="Période" className="mt-6 inline-flex rounded-control border border-borderControl p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={weeks === w}
              onClick={() => setWeeks(w)}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-4 text-base ${
                weeks === w ? 'bg-accent font-semibold text-accentForeground' : 'text-muted hover:text-foreground'
              }`}
            >
              {w} sem.
            </button>
          ))}
        </div>
        <p className="m-0 mt-3 text-sm text-muted">
          Événements sur {weeks === 1 ? 'la dernière semaine' : `les ${weeks} dernières semaines`}.
        </p>
        <p className="m-0 mt-1 text-sm">
          <a href={CLOUDFLARE_WEB_ANALYTICS} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Visites : Cloudflare Web Analytics
          </a>
        </p>
        <label className="mt-4 block max-w-xs text-sm text-muted">
          Facture du fournisseur d’IA sur la période (USD)
          <input
            className={FIELD}
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            aria-invalid={!costValid}
            placeholder="ex. 12,40"
          />
        </label>
        {error ? (
          <p role="alert" className="m-0 mt-4 text-sm text-criticalInk">
            {error}
          </p>
        ) : null}
        <Figures m={metrics} />
      </div>
    </Layout>
  );
}
