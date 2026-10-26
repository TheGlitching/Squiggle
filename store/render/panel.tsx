/**
 * The extension's real side panel (`SidepanelApp`), mounted outside the
 * extension. The only thing replaced is the browser around it: a `chrome`
 * global whose background answers `GET_TAB_STATE` with the fixture report, as
 * the real one does for a tab it has analysed.
 *
 * Query: `state=report|offer`, `select=<finding id>` clicks that finding's
 * card, `expand=<domain key>` opens that domain, `scroll=<CSS selector>` brings
 * that element to the top of the panel (by default, the selected card).
 */
import '../../src/index.css';
import { REPORT } from './fixture';

const params = new URLSearchParams(location.search);
const state = params.get('state') ?? 'report';

type Listener = (message: unknown, sender: unknown, respond: (response: unknown) => void) => unknown;
const listeners = new Set<Listener>();
const stored: Record<string, unknown> = {};
const tab = { id: 1, url: 'https://kiosque.example/societe/lecture', active: true, windowId: 1 };

function answer(type: string): unknown {
  if (type === 'GET_TAB_STATE') {
    return { state: state === 'report' ? { status: 'complete', result: REPORT } : null };
  }
  return { success: true };
}

const event = <T,>(set: Set<T>) => ({
  addListener: (fn: T) => void set.add(fn),
  removeListener: (fn: T) => void set.delete(fn),
});

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: {
      id: 'store-render',
      lastError: null,
      getURL: (path: string) => `/${path}`,
      onMessage: event(listeners),
      sendMessage: (message: { __isRpcRequest?: boolean; requestId?: string; type: string }, respond?: (r: unknown) => void) => {
        const response = message.__isRpcRequest
          ? { __isRpcResponse: true, requestId: message.requestId, success: true, result: answer(message.type) }
          : undefined;
        setTimeout(() => respond?.(response), 0);
      },
    },
    tabs: {
      query: (_query: unknown, respond?: (tabs: unknown[]) => void) => {
        respond?.([tab]);
        return Promise.resolve([tab]);
      },
      onUpdated: event(new Set()),
      onActivated: event(new Set()),
    },
    storage: {
      local: {
        get: async (keys?: string[]) =>
          Object.fromEntries((keys ?? Object.keys(stored)).filter((k) => k in stored).map((k) => [k, stored[k]])),
        set: async (items: Record<string, unknown>) => void Object.assign(stored, items),
        remove: async (keys: string | string[]) => [keys].flat().forEach((k) => delete stored[k]),
      },
      onChanged: event(new Set()),
    },
  },
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(find: () => Element | null | undefined): Promise<Element> {
  for (let i = 0; i < 200; i += 1) {
    const found = find();
    if (found) return found;
    await wait(25);
  }
  throw new Error('store render: the panel never showed what this shot needs');
}

async function main() {
  // The visit has been seen once already, as it has for any reader past their first open.
  localStorage.setItem('squiggle_onboarding_tour_v1', JSON.stringify({ completed: true, version: '1.0.0' }));

  const { SecureKeyStorage } = await import('../../src/crypto/storage');
  const keys = new SecureKeyStorage();
  if (state === 'report') {
    // A reader with their own key: the panel then shows the report with no account card above it.
    await keys.saveProviderConfig({ provider: 'openrouter', apiKey: 'store-render', model: '' });
    await keys.setActiveProvider('openrouter');
  } else {
    await keys.setMode('hosted');
  }

  const { createRoot } = await import('react-dom/client');
  const { SidepanelApp } = await import('../../src/sidepanel/main');
  createRoot(document.getElementById('panel')!).render(<SidepanelApp />);

  if (state === 'report') {
    await until(() => document.querySelector('[data-tour="finding-card"] > *'));
  } else {
    await until(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Se connecter'));
  }

  const select = params.get('select');
  if (select) {
    const label = REPORT.findings.find((f) => f.id === select)!.label;
    const card = await until(() =>
      [...document.querySelectorAll('[data-tour="finding-card"] > div')].find((el) =>
        el.querySelector('h4')?.textContent?.includes(label),
      ),
    );
    (card as HTMLElement).click();
    card.setAttribute('data-store-selected', '');
  }

  const expand = params.get('expand');
  if (expand) {
    const label = REPORT.categories.find((c) => c.domain === expand)!.label;
    const toggle = await until(() =>
      // The row's header is a clickable div, not a button.
      [...document.querySelectorAll('[data-tour="domain-scores"] > div > div:first-child')].find((row) =>
        row.textContent?.includes(label),
      ),
    );
    (toggle as HTMLElement).click();
  }

  const scroll = params.get('scroll') ?? (select ? '[data-store-selected]' : null);
  await wait(50);
  if (scroll) {
    const target = await until(() => document.querySelector(scroll));
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 16);
  }

  await document.fonts.ready;
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => {
  document.documentElement.dataset.ready = 'error';
  console.error(err);
});
