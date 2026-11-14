/** Role-scoped browser access. Tokens are tab-local, never bundled or logged. */
export type AccessRole = 'user' | 'caller';
const key = (role: AccessRole) => `tacit-access-${role}`;
export function readAccess(role: AccessRole): string {
  const url = new URL(location.href);
  const param = role === 'user' ? 'token' : 'invite';
  const provided = url.searchParams.get(param);
  if (provided) {
    try { sessionStorage.setItem(key(role), provided); } catch { /* private browsing may disable storage */ }
    // Keep capability links out of screenshots, copied page URLs and referrers.
    url.searchParams.delete(param);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return provided;
  }
  try { return sessionStorage.getItem(key(role)) ?? ''; } catch { return ''; }
}
export function storeAccess(role: AccessRole, value: string) {
  try { sessionStorage.setItem(key(role), value.trim()); } catch { /* current connection can still use its argument */ }
}
export function socketUrl(origin: string, path: string, access = '') {
  const url = new URL(path, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (access) url.searchParams.set(path === '/ws/caller' ? 'invite' : 'token', access);
  return url.href;
}
