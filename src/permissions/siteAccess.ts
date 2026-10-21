/**
 * The one optional permission: reading every site.
 *
 * By default the extension reads only the page the reader invoked it on
 * (`activeTab`). Two things need more, and both are the reader's choice:
 * analysing a page after changing site without invoking the extension again
 * (`activeTab` ends when the tab leaves the origin), and, in own-key mode, the
 * browser fetching the sources an article cites (a hosted analysis does that on
 * the server). The manifest lists the same patterns under
 * `optional_host_permissions`; a test keeps the two in step.
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

export async function revokeAllSitesAccess(): Promise<boolean> {
  try {
    return (await api()?.remove({ origins: ALL_SITES })) ?? false;
  } catch {
    return false;
  }
}
