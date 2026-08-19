/**
 * Mint the long-lived Chrome Web Store refresh token the release needs.
 *
 * Run once, by hand. The consent screen hands back a short-lived code on a
 * loopback redirect, and only an offline request with a forced consent prompt
 * returns a refresh token at all - ask without either and Google replies with an
 * access token that expires in an hour and no way to renew it, which is the usual
 * reason this step gets repeated.
 *
 * Usage:
 *   node scripts/cws-refresh-token.mjs <client-id> <client-secret>
 */
import { createServer } from 'node:http';

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error('usage: node scripts/cws-refresh-token.mjs <client-id> <client-secret>');
  process.exit(1);
}

const PORT = 8976;
const redirectUri = `http://localhost:${PORT}`;
const scope = 'https://www.googleapis.com/auth/chromewebstore';

const consentUrl =
  'https://accounts.google.com/o/oauth2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    // Without both of these the response carries no refresh token.
    access_type: 'offline',
    prompt: 'consent',
  });

async function exchange(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  return { ok: response.ok, body: await response.json() };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    response.end(`Refused: ${error}. You can close this tab.`);
    console.error(`consent refused: ${error}`);
    server.close();
    process.exitCode = 1;
    return;
  }
  if (!code) {
    response.end('Waiting for the consent redirect.');
    return;
  }

  const { ok, body } = await exchange(code);
  if (!ok || !body.refresh_token) {
    response.end('Could not obtain a refresh token. Check the terminal.');
    console.error('token exchange failed:', JSON.stringify(body, null, 2));
    if (body.access_token && !body.refresh_token) {
      console.error(
        '\nGoogle returned an access token but no refresh token. That happens when this\n' +
          'client was already authorised: revoke it at https://myaccount.google.com/permissions\n' +
          'and run this again.',
      );
    }
    server.close();
    process.exitCode = 1;
    return;
  }

  response.end('Refresh token issued. You can close this tab.');
  console.log('\nCWS_REFRESH_TOKEN:\n');
  console.log(body.refresh_token);
  console.log(
    '\nStore it as a repository secret. It stays valid until revoked, provided the\n' +
      "OAuth consent screen is published to Production - a project left in Testing\n" +
      'invalidates refresh tokens after seven days.',
  );
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this URL, sign in with the account that owns the store listing:\n');
  console.log(consentUrl.toString());
  console.log(`\nListening on ${redirectUri} for the redirect.`);
});
