/**
 * The one optional permission: reading every site.
 *
 * By default the extension reads only the page the reader invoked it on
 * (`activeTab`). Two things need more, and both are the reader's choice:
 * analysing a page after changing site without invoking the extension again
 * (`activeTab` ends when the tab leaves the origin), and, in own-key mode, the
 * browser fetching the sources an article cites (a hosted analysis does that on
 * the server). Reading a PDF needs its site's pages, asked for that site alone
 * when the reader opens one (`requestSiteAccess`). The manifest lists the same patterns under
 * `optional_host_permissions`; a test keeps the two in step. Reading a
 * podcast's feed asks the same way, for the one site that serves it.
 */
export const ALL_SITES = ['https://*/*', 'http://*/*'];

interface PermissionsApi {
  contains(p: { origins: string[] }): Promise<boolean>;
  request(p: { origins: string[] }): Promise<boolean>;
  remove(p: { origins: string[] }): Promise<boolean>;
}

function api(): PermissionsApi | undefined {
  const g = globalThis as unknown as {
    browser?: { permissions?: PermissionsApi };
    chrome?: { permissions?: PermissionsApi };
  };
  return g.browser?.permissions ?? g.chrome?.permissions;
}

export async function hasAllSitesAccess(): Promise<boolean> {
  try {
    return (await api()?.contains({ origins: ALL_SITES })) ?? false;
  } catch {
    return false;
  }
}

/** Must be called from a user gesture: the browser refuses it otherwise. */
export async function requestAllSitesAccess(): Promise<boolean> {
  try {
    return (await api()?.request({ origins: ALL_SITES })) ?? false;
  } catch {
    return false;
  }
}

/** Whether the extension may read `url`'s site, by the reader's grant of it or of every site. */
export async function hasSiteAccess(url: string): Promise<boolean> {
  try {
    return (await api()?.contains({ origins: [`${new URL(url).origin}/*`] })) ?? false;
  } catch {
    return false;
  }
}

/**
 * One site's pages, for the PDF page to fetch a PDF from it (`src/pdf`), or for
 * the panel to read a podcast's feed (`src/podcast`). Must
 * be called from a user gesture, before any await, like the request above.
 */
export async function requestSiteAccess(address: string): Promise<boolean> {
  try {
    return (await api()?.request({ origins: [`${new URL(address).origin}/*`] })) ?? false;
  } catch {
    return false;
  }
}

export async function revokeAllSitesAccess(): Promise<boolean> {
  try {
    return (await api()?.remove({ origins: ALL_SITES })) ?? false;
  } catch {
    return false;
  }
}
