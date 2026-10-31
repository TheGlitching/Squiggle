/**
 * The repository, through the GitHub REST API with a fine-grained token limited
 * to this repository (Contents and Pull requests, nothing else). The routine
 * never clones to write: it opens a branch `contenu/<slug>`, commits the files,
 * and opens a pull request that CI checks and the owner reviews and merges.
 * `main` requires a pull request, so the token cannot publish on its own.
 * Writes refuse to run in a dry run.
 */
import { REPO } from './config';
import { fetchJson, type Ctx } from './context';

const API = `https://api.github.com/repos/${REPO}`;
const AUTHOR = { name: 'TheGlitching', email: 'denfonteneau@gmail.com' };

export interface Pull {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  created_at: string;
  head: { ref: string };
  merge_commit_sha: string | null;
}

export class GitHub {
  constructor(private readonly ctx: Ctx) {}

  private call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if ((init.method ?? 'GET') !== 'GET' && this.ctx.dry) throw new Error(`écriture GitHub refusée à blanc : ${init.method} ${path}`);
    return fetchJson<T>(this.ctx, 'GitHub', `${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.ctx.secrets.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'content-type': 'application/json',
      },
    });
  }

  async contentPulls(state: 'open' | 'closed'): Promise<Pull[]> {
    const pulls = await this.call<Pull[]>(`/pulls?state=${state}&per_page=100`);
    return pulls.filter((p) => p.head.ref.startsWith('contenu/'));
  }

  pull(number: number): Promise<Pull> {
    return this.call(`/pulls/${number}`);
  }

  /** The owner's words on a pull request: its comments and its reviews. */
  async discussion(number: number): Promise<string[]> {
    const comments = await this.call<Array<{ body: string }>>(`/issues/${number}/comments?per_page=50`);
    const reviews = await this.call<Array<{ body: string | null }>>(`/pulls/${number}/reviews?per_page=50`);
    return [...comments.map((c) => c.body), ...reviews.map((r) => r.body ?? '')].filter((b) => b.trim());
  }

  /** A file's text at a ref, or null when it does not exist there. */
  async file(path: string, ref = 'main'): Promise<{ text: string; sha: string } | null> {
    try {
      const file = await this.call<{ content: string; sha: string }>(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { text: Buffer.from(file.content, 'base64').toString('utf8'), sha: file.sha };
    } catch (error) {
      if (String((error as Error).message).includes('HTTP 404')) return null;
      throw error;
    }
  }

  /**
   * One pull request from `main`: a branch, a commit per file, then the request.
   * A file set to `null` is deleted (a draft renamed on publication).
   */
  async propose(branch: string, title: string, body: string, files: Record<string, string | null>): Promise<Pull> {
    const main = await this.call<{ object: { sha: string } }>('/git/ref/heads/main');
    await this.call('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha }) });
    for (const [path, text] of Object.entries(files)) {
      const existing = await this.file(path, branch);
      if (text === null) {
        if (existing) {
          await this.call(`/contents/${path}`, {
            method: 'DELETE',
            body: JSON.stringify({ message: `${title}: remove ${path}`, sha: existing.sha, branch, author: AUTHOR, committer: AUTHOR }),
          });
        }
        continue;
      }
      await this.call(`/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `${title}: ${path}`,
          content: Buffer.from(text, 'utf8').toString('base64'),
          branch,
          ...(existing ? { sha: existing.sha } : {}),
          author: AUTHOR,
          committer: AUTHOR,
        }),
      });
    }
    return this.call<Pull>('/pulls', { method: 'POST', body: JSON.stringify({ title, body, head: branch, base: 'main', draft: false }) });
  }
}
