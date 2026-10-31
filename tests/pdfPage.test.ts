/**
 * "Analyser ce PDF": which tab address is a PDF, the extension page that reads
 * it, and the content script loaded into that page. There, the content script
 * hears every message the extension's own pages exchange, the panel's calls to
 * the background among them: it must answer only its own (`FC_*`), or its
 * answer would reach the panel before the background's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentScriptController } from '../src/content/contentScript';
import { isPdfAddress, isPdfPage, pdfPageUrl } from '../src/pdf/address';

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

let listeners: Listener[];

beforeEach(() => {
  listeners = [];
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://squiggle/${path}`,
      onMessage: { addListener: (l: Listener) => listeners.push(l), removeListener: vi.fn() },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('the PDF address', () => {
  it('is a web or local address whose path names a PDF', () => {
    expect(isPdfAddress('https://www.insee.fr/fr/statistiques/fichier/8719824/ip2087.pdf')).toBe(true);
    expect(isPdfAddress('https://exemple.fr/RAPPORT.PDF?download=1#page=3')).toBe(true);
    expect(isPdfAddress('file:///Users/moi/Téléchargements/tract.pdf')).toBe(true);
    expect(isPdfAddress('https://exemple.fr/article.html')).toBe(false);
    expect(isPdfAddress('https://exemple.fr/pdf/')).toBe(false);
    expect(isPdfAddress('chrome://settings/a.pdf')).toBe(false);
    expect(isPdfAddress(undefined)).toBe(false);
  });

  it('opens in the extension’s page, which the panel then treats as any article', () => {
    const page = pdfPageUrl('https://exemple.fr/rapport.pdf?v=2');
    expect(page).toBe('chrome-extension://squiggle/src/pdf/index.html?url=https%3A%2F%2Fexemple.fr%2Frapport.pdf%3Fv%3D2');
    expect(new URL(page).searchParams.get('url')).toBe('https://exemple.fr/rapport.pdf?v=2');
    expect(isPdfPage(page)).toBe(true);
    expect(isPdfAddress(page)).toBe(false);
  });
});

describe('the content script in an extension page', () => {
  it('answers its own messages and lets every other one pass', () => {
    new ContentScriptController(document, 'chrome-extension://squiggle/src/pdf/index.html').init();
    expect(listeners).toHaveLength(1);
    const [listener] = listeners;

    const panelCall = vi.fn();
    const rpc = { __isRpcRequest: true, requestId: 'r1', type: 'TRIGGER_ANALYSIS', payload: { tabId: 4 } };
    expect(listener(rpc, {}, panelCall)).toBe(false);
    expect(listener({ type: 'ANALYSIS_PROGRESS', payload: {} }, {}, panelCall)).toBe(false);
    expect(panelCall).not.toHaveBeenCalled();

    const own = vi.fn();
    expect(listener({ type: 'FC_PING' }, {}, own)).toBe(true);
    expect(own).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
