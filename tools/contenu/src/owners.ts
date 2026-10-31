/**
 * The only senders whose replies the routine reads: the owner's own address and
 * the project's. Shared by the reply Worker, which drops every other message,
 * and by the routine. Kept free of Node imports so the Worker can bundle it.
 */
export const OWNER_SENDERS = ['denfonteneau@gmail.com', 'contact@squiggle.fr'] as const;

/** Where the weekly report's replies go, routed in Cloudflare to `worker/`. */
export const REPLY_TO = 'routine@squiggle.fr';
