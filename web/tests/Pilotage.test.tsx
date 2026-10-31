/** The owner's metrics page: the 404 to anyone the server does not recognise as the owner. */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import type { OwnerMetrics } from '../src/api';
import { countCampaign } from '../src/count';
import { installFetch, jsonResponse } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const stage = { calls: 10, failed: 1, failureRate: 0.1 };
const METRICS: OwnerMetrics = {
  windowWeeks: 1,
  cache: { checks: 20, hits: 5, hitRate: 0.25 },
  stages: { audit: { ...stage, truncated: 0 }, research: stage, sourceCheck: stage },
  audience: {
    campaigns: { clemi: 3 },
    clicks: {},
    flags: { categories: { sophisme: 2, cadrage: 0 }, reasons: { misread: 1, too_harsh: 1 } },
  },
  funnel: {
    signin: { completed: 8, after_anon: 1, after_withheld: 1 },
    checkout: {},
    runsStarted: { session: 12, anon: 6 },
    finalized: { session: 11, anon: 5 },
    refused: { anon_closed: 2, transcription_closed: 3 },
    reportsWithheld: 4,
  },
  headline: {
    newAccounts: { count: 7 },
    activationWithinWeek: { cohort: 4, activated: 3, share: 0.75 },
    successRate: { started: 12, finalized: 11, share: 0.917 },
    subscribers: { paying: 2, free: 5, cancelled: 0 },
    aiCost: { finalized: 11, costPerAnalysisUsd: null },
    activeAccounts: 9,
  },
  transcription: { count: 14, failed: 1, minutes: 62.5, costUsd: 0.2188, dailyCapMinutes: 600 },
};

describe('/tableau', () => {
  it('is the 404 page, counting nothing, for anyone the server refuses', async () => {
    window.history.pushState({}, '', '/tableau');
    const { calls } = installFetch(() => undefined);
    countCampaign();
    render(<App />);
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/web/tableau?weeks=1'))).toBe(true));
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
    expect(calls.filter((call) => call.url.endsWith('/web/count'))).toEqual([]);
  });

  it('shows the owner the five weekly figures and changes window on request', async () => {
    window.history.pushState({}, '', '/tableau');
    const { calls } = installFetch((call) =>
      call.url.startsWith('/web/tableau') ? jsonResponse({ ok: true, metrics: METRICS }) : undefined,
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.queryByText('Visites')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visites : Cloudflare Web Analytics' })).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/?to=/:account/web-analytics',
    );
    expect(screen.getByRole('heading', { name: 'Campagnes, boutons, textes collés' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Constats signalés comme erronés' })).toBeInTheDocument();
    expect(screen.getByText('Sophisme').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Le passage ne dit pas cela').nextSibling).toHaveTextContent('1');
    expect(screen.queryByText('Cadrage')).not.toBeInTheDocument();
    expect(screen.getByText('Nouveaux comptes').nextSibling).toHaveTextContent('7');
    expect(screen.getByText('Première analyse dans la semaine').nextSibling).toHaveTextContent('75 %');
    expect(screen.getByText('Abonnés payants').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('5 accès offerts · 0 résiliations')).toBeInTheDocument();
    expect(screen.getByText(/coût : indiquez la facture/)).toBeInTheDocument();
    // The analysis without an account, read in one place.
    const anon = screen.getByRole('heading', { name: 'Analyse sans compte' }).nextElementSibling as HTMLElement;
    expect(anon).toHaveTextContent('Lancées6');
    expect(anon).toHaveTextContent('Réussies5');
    expect(anon).toHaveTextContent('Refusées : déjà faite-');
    expect(anon).toHaveTextContent('Refusées : plafond du jour atteint2');
    expect(anon).toHaveTextContent('Rapports floutés affichés4');
    expect(anon).toHaveTextContent('Comptes créés ensuite1');
    expect(anon).toHaveTextContent('dont depuis un rapport flouté1');
    expect(document.title).toBe('Tableau de bord - Squiggle');
    // What transcription cost, beside the cap that bounds it.
    const spent = screen.getByRole('heading', { name: 'Sur la période' }).nextElementSibling as HTMLElement;
    expect(spent).toHaveTextContent('Enregistrements transcrits14');
    expect(spent).toHaveTextContent('Minutes de son62,5');
    expect(spent).toHaveTextContent(/Coût de la transcription0,2188\s\$US/);
    const cap = screen.getByRole('heading', { name: 'Plafond de dépense' }).nextElementSibling as HTMLElement;
    expect(cap).toHaveTextContent(/Par jour, tous comptes600 min · 2,10?\s\$US/);
    expect(cap).toHaveTextContent('Refus : plafond du site atteint3');

    await userEvent.click(screen.getByRole('button', { name: '4 sem.' }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe('/web/tableau?weeks=4'));
    await userEvent.type(screen.getByLabelText(/Facture du fournisseur/), '1,5');
    await waitFor(() => expect(calls.at(-1)?.url).toBe('/web/tableau?weeks=4&costUsd=1.5'));
    expect(calls.filter((call) => call.url.endsWith('/web/count'))).toEqual([]);
  });

  it('reads a figure the server left out as "-" instead of going blank', async () => {
    window.history.pushState({}, '', '/tableau');
    const partial = structuredClone(METRICS) as unknown as {
      stages: Record<string, Record<string, unknown>>;
      headline: { subscribers: Record<string, unknown> };
    };
    delete partial.stages.audit.truncated;
    delete partial.stages.research.failed;
    partial.stages.sourceCheck = { failureRate: null };
    delete partial.headline.subscribers.cancelled;
    delete (partial as unknown as { audience: Record<string, unknown> }).audience.flags;
    installFetch((call) =>
      call.url.startsWith('/web/tableau') ? jsonResponse({ ok: true, metrics: partial }) : undefined,
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText('5 accès offerts · - résiliations')).toBeInTheDocument();
    expect(screen.getByText('Audits tronqués').nextSibling).toHaveTextContent('-');
    expect(screen.getByText(/^- \/ 10 · 10/)).toBeInTheDocument();
    expect(screen.getByText('Sources citées').nextSibling).toHaveTextContent('- / - · -');
    expect(screen.getByRole('heading', { name: 'Constats signalés comme erronés' })).toBeInTheDocument();
  });
});
