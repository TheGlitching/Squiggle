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
  audience: { campaigns: { clemi: 3 }, clicks: {} },
  funnel: { signin: { completed: 8 }, checkout: {}, runsStarted: { session: 12 }, finalized: { session: 11 }, refused: {} },
  headline: {
    newAccounts: { count: 7 },
    activationWithinWeek: { cohort: 4, activated: 3, share: 0.75 },
    successRate: { started: 12, finalized: 11, share: 0.917 },
    subscribers: { paying: 2, free: 5, cancelled: 0 },
    aiCost: { finalized: 11, costPerAnalysisUsd: null },
    activeAccounts: 9,
  },
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
    expect(screen.getByRole('heading', { name: 'Campagnes et boutons' })).toBeInTheDocument();
    expect(screen.getByText('Nouveaux comptes').nextSibling).toHaveTextContent('7');
    expect(screen.getByText('Première analyse dans la semaine').nextSibling).toHaveTextContent('75 %');
    expect(screen.getByText('Abonnés payants').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('5 accès offerts · 0 résiliations')).toBeInTheDocument();
    expect(screen.getByText(/coût : indiquez la facture/)).toBeInTheDocument();
    expect(document.title).toBe('Tableau de bord - Squiggle');

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
    installFetch((call) =>
      call.url.startsWith('/web/tableau') ? jsonResponse({ ok: true, metrics: partial }) : undefined,
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText('5 accès offerts · - résiliations')).toBeInTheDocument();
    expect(screen.getByText('Audits tronqués').nextSibling).toHaveTextContent('-');
    expect(screen.getByText(/^- \/ 10 · 10/)).toBeInTheDocument();
    expect(screen.getByText('Sources citées').nextSibling).toHaveTextContent('- / - · -');
  });
});
