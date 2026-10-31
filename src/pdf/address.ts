/**
 * Which tab shows a PDF, and the extension page that reads it (`main.ts`).
 * Apart from that page so the panel can link to it without loading pdf.js.
 */
import { UnifiedRuntime } from '../messaging/runtime';

const PAGE = 'src/pdf/index.html';

/** An address whose path names a PDF file: what a browser shows in its own PDF viewer. */
export function isPdfAddress(address: string | undefined): boolean {
  if (!address) return false;
  try {
    const url = new URL(address);
    return ['https:', 'http:', 'file:'].includes(url.protocol) && /\.pdf$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** The extension page that reads the PDF at this address. */
export function pdfPageUrl(address: string): string {
  return UnifiedRuntime.getURL(`${PAGE}?${new URLSearchParams({ url: address })}`);
}

/** Whether this page is that one: the panel offers its usual button there. */
export function isPdfPage(address: string | undefined): boolean {
  return Boolean(address?.startsWith(UnifiedRuntime.getURL(PAGE)));
}
