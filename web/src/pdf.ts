/**
 * A PDF, from the file to the text the form is given.
 *
 * The reader imports a PDF, or shares one to the installed app, and its text
 * is read here, on the device, by pdf.js, served from our own origin under
 * `/pdf/` (`vite.config.ts`) and fetched on a first PDF only, so no page of
 * the site carries it. The headings and paragraphs are put back together as
 * the extension does it (`shared/src/extract/pdf.ts`). No file is sent
 * anywhere: what reaches the server is the text, as a paste would.
 *
 * A scanned PDF has no text, only pictures of pages: those pages are drawn
 * here and read by the screenshots' OCR (`captures.ts`).
 */
import type * as PdfJsModule from 'pdfjs-dist';

import { readPdf, type PdfBlock, type PdfDocument, type PdfJs } from '../../shared/src/extract/pdf';

/** Where pdf.js's own files are served from (`vite.config.ts`). */
export const PDF_BASE = '/pdf/';

/** Less text than this in the whole file, and it is a scan. */
const SCAN_CHARS = 100;
/** Pages drawn for the OCR this many times their size in points: about 1 200 pixels wide for A4. */
const SCAN_SCALE = 2;

/** pdf.js, loaded on the first PDF and kept for the next. */
let pdfjs: Promise<typeof PdfJsModule> | null = null;

function loadPdfJs(): Promise<typeof PdfJsModule> {
  // What an older phone's browser lacks first, then pdf.js; its worker does the same (`worker.mjs`).
  pdfjs ??= import(/* @vite-ignore */ `${PDF_BASE}compat.mjs`)
    .then(() => import(/* @vite-ignore */ `${PDF_BASE}pdf.min.mjs`))
    .then((module: typeof PdfJsModule) => {
      module.GlobalWorkerOptions.workerSrc = `${PDF_BASE}worker.mjs`;
      return module;
    });
  // A failed load (offline) is tried again on the next PDF.
  pdfjs.catch(() => (pdfjs = null));
  return pdfjs;
}

export interface PdfRead {
  title: string;
  blocks: PdfBlock[];
  pages: number;
  /** A scan: no text in the file, only pictures of its pages. */
  scanned: boolean;
}

/**
 * The text of this PDF, read on this device; for a scan, the pictures of its
 * first `maxScanPages` pages too, for the OCR to read.
 */
export async function readPdfFile(
  file: Blob,
  maxScanPages: number,
  signal?: AbortSignal,
): Promise<PdfRead & { scans: Blob[] }> {
  const pdf = await loadPdfJs();
  const read = await readPdf(
    {
      getDocument: (source) =>
        pdf.getDocument({ ...source, wasmUrl: new URL(`${PDF_BASE}wasm/`, window.location.origin).href }),
    } as PdfJs,
    await file.arrayBuffer(),
    signal,
  );
  try {
    const chars = read.blocks.reduce((total, block) => total + block.text.length, 0);
    const scanned = chars < SCAN_CHARS;
    const scans = scanned ? await drawPages(read.document, Math.min(read.pages, maxScanPages), signal) : [];
    return { title: read.title, blocks: read.blocks, pages: read.pages, scanned, scans };
  } finally {
    await read.close().catch(() => {});
  }
}

/** The first `count` pages, drawn as images. */
async function drawPages(document: PdfDocument, count: number, signal?: AbortSignal): Promise<Blob[]> {
  const images: Blob[] = [];
  for (let number = 1; number <= count; number++) {
    if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError');
    const page = (await document.getPage(number)) as unknown as PdfJsModule.PDFPageProxy;
    const viewport = page.getViewport({ scale: SCAN_SCALE });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    images.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('page not drawn'))), 'image/png')));
  }
  return images;
}
