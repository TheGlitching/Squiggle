/**
 * The article inside a forwarded e-mail.
 *
 * A reader who forwards a newsletter, an article or a chain letter sends us
 * their own note, a forwarding header, the text, and often a signature. Only
 * the text is the article: the note is the reader's, and the header names the
 * people the message went through. This module keeps the text and the
 * forwarded subject (the article's title) and drops the rest, so the audit
 * reads what was forwarded and nothing about who forwarded it.
 *
 * It is pure string work on the plain-text part the MIME parser gives back,
 * which is the text/plain alternative when the message has one and the HTML
 * rendered to text when it does not. Nothing here follows a link.
 */

export interface ForwardedArticle {
  title: string;
  /** One paragraph per line. */
  text: string;
}

/**
 * The line a mail client writes above a forwarded message: Gmail, Outlook,
 * Thunderbird, Yahoo in English and in French, and Apple Mail's sentence.
 */
const FORWARD_MARKERS = [
  /^-{2,}\s*(?:forwarded message|message transf[ée]r[ée]|original message|message d['’]origine|message original)\s*-{2,}$/i,
  /^(?:begin forwarded message|d[ée]but du message r[ée]exp[ée]di[ée])\s*:$/i,
  // Outlook's rule above the « De : … Envoyé : … » block.
  /^_{10,}$/,
];

/** A line of the forwarded header block. */
const HEADER_LINE = /^(?:from|de|date|sent|envoy[ée]|subject|objet|sujet|to|[àa]|cc|reply-to|r[ée]pondre [àa])\s*:/i;
const SUBJECT_LINE = /^(?:subject|objet|sujet)\s*:\s*(.*)$/i;
/** What clients put in front of a forwarded subject, repeated for a forward of a forward. */
const SUBJECT_PREFIX = /^(?:\s*(?:fwd?|tr|wg|rv|fw|re|réf|ref)\s*:\s*)+/i;
/** The line a phone's mail app signs a message with. */
const DEVICE_SIGNATURE = /^(?:envoy[ée] (?:de|depuis) (?:mon|ma|l['’]appli)|sent from my|get outlook for)\b/i;
/** The RFC 3676 signature separator. */
const SIGNATURE = /^--\s?$/;
const BULLET = /^(?:[-*•–]\s|\d+[.)]\s)/;
/** A hard-wrapped line is long and stops mid-sentence; a short one is a line of its own. */
const WRAP_WIDTH = 60;
const SENTENCE_END = /[.!?:;»"”…]$/;

/** The article in a forwarded message's plain text, under its forwarded subject. */
export function forwardedArticle(subject: string | undefined, body: string | undefined): ForwardedArticle {
  let lines = (body ?? '').replace(/\r\n?/g, '\n').split('\n');
  let title = (subject ?? '').replace(SUBJECT_PREFIX, '').trim();

  // The last marker is the innermost message: in a forward of a forward, what
  // lies between two markers is the middle reader's own note.
  let marker = -1;
  lines.forEach((line, index) => {
    if (FORWARD_MARKERS.some((re) => re.test(line.trim()))) marker = index;
  });
  if (marker >= 0) {
    let i = marker + 1;
    while (i < lines.length && !lines[i].trim()) i += 1;
    while (i < lines.length && (HEADER_LINE.test(lines[i].trim()) || (!lines[i].trim() && HEADER_LINE.test(lines[i + 1]?.trim() ?? '')))) {
      const forwardedSubject = SUBJECT_LINE.exec(lines[i].trim())?.[1]?.replace(SUBJECT_PREFIX, '').trim();
      if (forwardedSubject) title = forwardedSubject;
      i += 1;
    }
    lines = lines.slice(i);
  }

  const signature = lines.findIndex((line) => SIGNATURE.test(line));
  if (signature >= 0) lines = lines.slice(0, signature);
  lines = lines.filter((line) => !DEVICE_SIGNATURE.test(line.trim()));

  // A client that forwards inline as a quotation puts "> " before every line.
  const filled = lines.filter((line) => line.trim());
  if (filled.length && filled.every((line) => line.trimStart().startsWith('>'))) {
    lines = lines.map((line) => line.replace(/^\s*>\s?/, ''));
  }

  return { title, text: reflow(lines).join('\n') };
}

/**
 * Paragraphs out of plain-text lines. Most clients wrap a plain-text part at
 * about 76 columns, which would cut every paragraph into a block per line:
 * a long line that does not end a sentence is joined to the next one.
 */
function reflow(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current = '';
  let last = '';
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (current && (!line || BULLET.test(line) || last.length < WRAP_WIDTH || SENTENCE_END.test(last))) {
      paragraphs.push(current);
      current = '';
    }
    if (line) current = current ? `${current} ${line}` : line;
    last = line;
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

const LINK = /https?:\/\/[^\s<>"]+/i;

/**
 * The address a message that says nothing beyond its link brings instead: it
 * is only ever looked up among the reports already filed, never requested.
 */
export function firstLink(text: string): string | null {
  return LINK.exec(text)?.[0].replace(/[).,;:!?»]+$/, '') ?? null;
}

/** The text with its links set aside: what the message says beyond the addresses it gives. */
export function withoutLinks(text: string): string {
  return text.replace(new RegExp(LINK.source, 'gi'), ' ').replace(/\s+/g, ' ').trim();
}
