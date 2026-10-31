/**
 * The model, DeepSeek V4.1 Flash through OpenRouter, on the routine's own key
 * (capped at 5 $ a month by OpenRouter itself). Never an Anthropic key, and
 * never the hosted server: it only analyses articles, and turning it into a
 * relay would break its invariants.
 *
 * Every call is priced from OpenRouter's own `usage.cost` and recorded, and a
 * run stops calling the model once it has spent `CAPS.openrouterPerRun`: that
 * much in one run is a loop, not a week's work. The model has vision, so a
 * review can be shown the image a post will carry.
 *
 * What the model is given to read (comments, the owner's replies, pages) is
 * data. Each system prompt says so, and every answer is JSON the program reads
 * field by field: a reply can only ever land in one of the closed categories.
 */
import { CAPS, MODEL } from './config';
import { fetchJson, type Ctx } from './context';

const API = 'https://openrouter.ai/api/v1';

export class BudgetExceeded extends Error {}

interface Completion {
  choices: Array<{ message: { content: string | null }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; cost?: number };
}

export interface Ask {
  /** Names the call in the run's journal: `redaction`, `relecture`, `strategie`... */
  purpose: string;
  system: string;
  user: string;
  /** Images the model looks at, by public address. */
  images?: string[];
  maxTokens?: number;
}

export function runCost(ctx: Pick<Ctx, 'db' | 'runId'>): number {
  return ctx.db.get<{ usd: number | null }>("SELECT SUM(usd) AS usd FROM spend WHERE service = 'openrouter' AND run_id = ?", ctx.runId)?.usd ?? 0;
}

/** What the key has spent this month, as OpenRouter counts it. */
export async function monthlySpend(ctx: Pick<Ctx, 'fetch' | 'secrets'>): Promise<{ used: number; limit: number | null }> {
  const key = await fetchJson<{ data: { usage_monthly?: number; usage: number; limit: number | null } }>(ctx, 'OpenRouter', `${API}/key`, {
    headers: { Authorization: `Bearer ${ctx.secrets.openrouterKey}` },
  });
  return { used: key.data.usage_monthly ?? key.data.usage, limit: key.data.limit };
}

/** One call, answered in JSON. Throws `BudgetExceeded` rather than spend past a cap. */
export async function askJson<T>(ctx: Ctx, ask: Ask): Promise<T> {
  if (runCost(ctx) >= CAPS.openrouterPerRun) throw new BudgetExceeded(`plafond par exécution atteint (${CAPS.openrouterPerRun} $)`);
  const monthStarted = ctx.db.getKv<{ checkedAt: string; used: number }>('openrouter_month');
  if (!monthStarted || Date.now() - Date.parse(monthStarted.checkedAt) > 3_600_000) {
    const spend = await monthlySpend(ctx);
    ctx.db.setKv('openrouter_month', { checkedAt: new Date().toISOString(), used: spend.used });
    if (spend.used >= CAPS.openrouterMonthly) throw new BudgetExceeded(`plafond mensuel atteint (${CAPS.openrouterMonthly} $)`);
  }

  const content = ask.images?.length
    ? [{ type: 'text', text: ask.user }, ...ask.images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : ask.user;
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: `${ask.system}\n\nRéponds uniquement par un objet JSON valide, sans texte autour.` },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
    max_tokens: ask.maxTokens ?? 2000,
    temperature: 0.4,
    usage: { include: true },
  };
  const answer = await fetchJson<Completion>(ctx, 'OpenRouter', `${API}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.secrets.openrouterKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://github.com/TheGlitching/Squiggle',
      'X-Title': 'Squiggle routine contenu',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  ctx.db.run(
    "INSERT INTO spend (at, service, usd, run_id) VALUES (?, 'openrouter', ?, ?)",
    new Date().toISOString(),
    answer.usage?.cost ?? 0,
    ctx.runId,
  );
  const text = answer.choices[0]?.message.content ?? '';
  if (answer.choices[0]?.finish_reason === 'length') throw new Error(`${ask.purpose} : réponse coupée par la limite de longueur`);
  return parseJson<T>(text, ask.purpose);
}

/** The JSON object in an answer, tolerating a fence the model added around it. */
export function parseJson<T>(text: string, purpose: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${purpose} : pas de JSON dans la réponse`);
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    throw new Error(`${purpose} : JSON illisible`);
  }
}
