/**
 * "Analyser ce PDF": the extension's own page, opened in the PDF's tab by the
 * panel (`address.ts`).
 *
 * No browser lets an extension's script into its PDF viewer, so the file is
 * read here instead, by pdf.js, in the reader's browser: fetched from the
 * address the tab showed, with the reader's own cookies (the browser usually
 * has it in its cache already), or picked on the device when that fails. Our
 * server never sees the file. Its headings and paragraphs are laid out as an
 * article (`shared/src/extract/pdf.ts`), the content script is loaded into
 * this page as it is injected into any other, and the analysis starts on its
 * own, once per opening: the panel and the highlights then work here as on a
 * news page. A PDF too long for one analysis shows the first pages that fit,
 * with the choice of others. A scanned PDF has no text to read here: the
 * reader is sent to the site, which reads its pages with its OCR.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { pagesThatFit, readPdf, type PdfBlock, type PdfJs, type ReadPdf } from '../../shared/src/extract/pdf';
import { ANALYSE_URL } from '../hosted/config';
import { TypedMessageBus } from '../messaging/messageBus';
import { CONTENT_SCRIPT_FILE, UnifiedRuntime } from '../messaging/runtime';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Less text than this in the whole file, and it is a scan. */
const SCAN_CHARS = 100;

const source = new URLSearchParams(window.location.search).get('url') ?? '';
const status = document.getElementById('status')!;
const choices = document.getElementById('choices')!;
const article = document.getElementById('article')!;

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

function say(text: string, link?: { href: string; label: string }) {
  status.textContent = text;
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.className = 'ml-1 font-semibold text-accent-hover underline';
    a.textContent = link.label;
    status.append(' ', a);
  }
}

const BUTTON =
  'rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel-muted disabled:opacity-50';
const FIELD = 'mt-1 block w-24 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink';

/** "Choisir le fichier PDF": the file on the device, when the address cannot be read. */
function offerPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void open(() => file.arrayBuffer());
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON;
  button.textContent = 'Choisir le fichier PDF';
  button.addEventListener('click', () => input.click());
  choices.replaceChildren(input, button);
  choices.hidden = false;
}

/** The pages `from` to `to`, laid out as the article the content script reads. */
function render(read: ReadPdf, from: number, to: number) {
  const title = document.createElement('h1');
  title.className = 'mb-6 font-display text-3xl font-semibold leading-tight';
  title.textContent = read.title || 'Document PDF';
  const shown = read.blocks.filter((block: PdfBlock) => block.page >= from && block.page <= to);
  // The title is often the first heading too: once is enough.
  const repeat = shown.find((block) => block.type === 'heading' && block.text === title.textContent);
  const blocks = shown
    .filter((block) => block !== repeat)
    .map((block) => {
      const el = document.createElement(block.type === 'heading' ? 'h2' : 'p');
      el.className = block.type === 'heading' ? 'mt-8 mb-3 font-display text-xl font-semibold' : 'mb-4';
      el.textContent = block.text;
      return el;
    });
  article.replaceChildren(title, ...blocks);
  article.hidden = false;
}

/** The range of a long PDF's pages to analyse: changing the first page suggests the last that fits. */
function offerPages(read: ReadPdf, to: number) {
  const field = (label: string, value: number) => {
    const wrap = document.createElement('label');
    wrap.className = 'text-sm';
    wrap.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min: '1', max: String(read.pages), value: String(value), className: FIELD });
    input.inputMode = 'numeric';
    wrap.append(input);
    return { wrap, input };
  };
  const first = field('De la page', 1);
  const last = field('à la page', to);
  const page = (input: HTMLInputElement) => Math.min(read.pages, Math.max(1, Math.round(Number(input.value)) || 1));
  first.input.addEventListener('change', () => {
    last.input.value = String(pagesThatFit(read.blocks, page(first.input), read.pages));
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON;
  button.textContent = 'Analyser ces pages';
  button.addEventListener('click', () => {
    const from = page(first.input);
    const until = Math.max(from, page(last.input));
    render(read, from, until);
    say(`Pages ${from} à ${until} affichées : leur analyse suit dans le panneau Squiggle.`);
    void analyse();
  });
  choices.replaceChildren(first.wrap, last.wrap, button);
  choices.hidden = false;
}

/** The content script, loaded once, as the background injects it into any page. */
let contentScript: Promise<void> | null = null;
function loadContentScript(): Promise<void> {
  contentScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = UnifiedRuntime.getURL(CONTENT_SCRIPT_FILE);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('content script'));
    document.head.append(script);
  });
  return contentScript;
}

/** Starts the analysis of this tab, as the panel's button does. */
async function analyse() {
  await loadContentScript();
  const tab = await UnifiedRuntime.getTabs().getCurrent();
  if (tab?.id === undefined) return;
  // Errors reach the panel by the background's own events.
  void new TypedMessageBus('sidepanel').callRPC('TRIGGER_ANALYSIS', { tabId: tab.id }).catch(() => {});
}

async function open(bytes: () => Promise<ArrayBuffer>) {
  choices.hidden = true;
  say('Lecture du PDF…');
  let read: ReadPdf;
  try {
    read = await readPdf(pdfjs as unknown as PdfJs, await bytes());
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') return say('Ce PDF est protégé par un mot de passe : Squiggle ne peut pas le lire.');
    if (name === 'InvalidPDFException') return say('Ce fichier n’est pas un PDF lisible.');
    say(
      'Squiggle n’a pas pu ouvrir ce PDF depuis son adresse. Enregistrez-le sur votre appareil, ' +
        'puis choisissez le fichier : il sera lu ici, sans être envoyé.',
    );
    return offerPicker();
  }
  void read.close();
  const chars = read.blocks.reduce((total, block) => total + block.text.length, 0);
  if (chars < SCAN_CHARS) {
    return say(
      'Ce PDF est un document scanné : il ne contient que des images de pages, sans texte à lire ici. ' +
        'Enregistrez-le, puis importez-le sur le site de Squiggle, qui sait lire les pages scannées sur votre appareil :',
      { href: ANALYSE_URL, label: 'Analyser un PDF scanné' },
    );
  }
  // The tab's title is the one the report takes (the content script reads the page as an article).
  document.title = read.title || 'Document PDF';
  const to = pagesThatFit(read.blocks, 1, read.pages);
  render(read, 1, to);
  if (to < read.pages) {
    say(
      `Ce PDF de ${read.pages} pages est trop long pour une seule analyse : en voici les pages 1 à ${to}, ` +
        'dont l’analyse suit dans le panneau Squiggle. Pour une autre partie, choisissez ses pages.',
    );
    offerPages(read, to);
  } else {
    say(
      `Texte lu dans le PDF (${plural(read.pages, 'page')}), dans votre navigateur : le fichier n’a été envoyé nulle part. ` +
        'L’analyse suit dans le panneau Squiggle, et ses constats sont surlignés ici.',
    );
  }
  // Once per opening: coming back to this page, or reloading it, shows the panel's report.
  const key = `squiggle-pdf:${source}`;
  if (sessionStorage.getItem(key)) return void loadContentScript();
  sessionStorage.setItem(key, '1');
  await analyse();
}

if (/^https?:/.test(source)) {
  // The report's address is the PDF's: the same file opened again finds the same report.
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = source;
  document.head.append(canonical);
}
if (source) {
  void open(async () => {
    const response = await fetch(source, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  });
} else {
  say('Choisissez le PDF à analyser : il sera lu ici, sans être envoyé.');
  offerPicker();
}
