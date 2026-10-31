/**
 * A short message (a chain forwarded on a messaging app, a two-line social
 * post, a text message), as the extension, the web app and the server all
 * recognise it.
 *
 * It is analysed under its own instructions (`prompts.ts`): the article grid
 * judges sourcing and structure across a long text, and would mark a two-line
 * rumour on what it cannot hold rather than on what it claims. Which
 * instructions apply is read from the length of the text itself, as the video
 * mode is read from the address, so no client-declared flag can change which
 * instructions a cached report was produced under: the same words always get
 * the same mode, and the text fingerprint already keys the cache on them.
 */
import { isVideoTranscriptUrl } from './video';

/**
 * Below this, a text is too short to claim anything ("ok", "Merci !"). A rumour
 * fits in one short sentence ("Le lait de vache donne le cancer"), well above it.
 */
export const MIN_MESSAGE_CHARS = 20;

/**
 * Up to this, a text is read as a message rather than an article. Chains and
 * posts run from one line to a few paragraphs; the extension refuses a page
 * under 200 words (about 1 200 characters) as a teaser, so no article it reads
 * falls under this, and a press brief that does is read well by the message
 * questions anyway: what it is about, who says it, what is known, what is missing.
 */
export const MAX_MESSAGE_CHARS = 1_200;

/** The characters a text carries, counted as the server counts an article (`articleLength`). */
function textLength(blocks: ReadonlyArray<{ text: string }>): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}

/** Whether a text is analysed as a short message. A video's transcript, however short, stays a transcript. */
export function isShortMessage(input: { url: string; blocks: ReadonlyArray<{ text: string }> }): boolean {
  return !isVideoTranscriptUrl(input.url) && textLength(input.blocks) <= MAX_MESSAGE_CHARS;
}
