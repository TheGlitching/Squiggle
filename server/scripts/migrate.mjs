// Applies pending migrations on a deployed Worker through POST /admin/migrate.
//   ADMIN_TOKEN=… npm run migrate -w @squiggle/server -- https://<host>
// The token comes from the environment, never from argv, so it stays out of
// shell history and process listings.
const base = process.argv[2];
const token = process.env.ADMIN_TOKEN;
if (!base || !token) {
  console.error('usage: ADMIN_TOKEN=… migrate.mjs <origin>');
  process.exit(2);
}

const res = await fetch(new URL('/admin/migrate', base), {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
});
const body = await res.json().catch(() => null);
if (!res.ok || body?.ok !== true) {
  console.error(`migration failed: ${res.status} ${body?.error ?? ''} ${body?.message ?? ''}`.trim());
  process.exit(1);
}
console.log(body.applied.length > 0 ? `applied: ${body.applied.join(', ')}` : 'already up to date');
