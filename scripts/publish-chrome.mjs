/**
 * Upload the packaged extension to the Chrome Web Store and publish it.
 *
 * The store's API is used directly rather than through a third-party action, so
 * the only thing holding these credentials is this repository.
 *
 * The trap this guards against: both endpoints answer HTTP 200 while reporting
 * failure in the body. An upload that was rejected for a duplicate version, or a
 * publish blocked pending review, both come back 200, so a release that only
 * checked the status code would report success and ship nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

const required = ['CWS_EXTENSION_ID', 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`missing repository secret(s): ${missing.join(', ')}`);
}

const {
  CWS_EXTENSION_ID: extensionId,
  CWS_CLIENT_ID: clientId,
  CWS_CLIENT_SECRET: clientSecret,
  CWS_REFRESH_TOKEN: refreshToken,
  PUBLISH_TARGET: publishTarget = 'default',
} = process.env;

const archive = join(root, 'packages', `squiggle-chrome-${version}.zip`);
const packaged = readdirSync(join(root, 'packages'));
if (!packaged.includes(`squiggle-chrome-${version}.zip`)) {
  throw new Error(`${archive} is missing; packaged instead: ${packaged.join(', ') || 'nothing'}`);
}

/** A refresh token is long-lived; the access token it mints lasts an hour. */
async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`could not exchange the refresh token: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

const token = await accessToken();
const authorised = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };

console.log(`uploading ${version} to item ${extensionId}`);
const upload = await fetch(
  `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
  { method: 'PUT', headers: authorised, body: readFileSync(archive) },
);
const uploadResult = await upload.json();

// uploadState is the real verdict; the HTTP status is not.
if (uploadResult.uploadState !== 'SUCCESS') {
  const detail = (uploadResult.itemError ?? [])
    .map((e) => e.error_detail ?? e.error_code)
    .join('; ');
  throw new Error(`upload rejected (${uploadResult.uploadState}): ${detail || JSON.stringify(uploadResult)}`);
}
console.log('upload accepted');

console.log(`publishing to ${publishTarget}`);
const publish = await fetch(
  `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish?publishTarget=${publishTarget}`,
  { method: 'POST', headers: { ...authorised, 'Content-Length': '0' } },
);
const publishResult = await publish.json();

const statuses = publishResult.status ?? [];
// A new version normally lands in review; that is a success, not a failure, so
// only genuinely bad states stop the release.
const failed = statuses.filter(
  (status) => !['OK', 'PUBLISHED', 'ITEM_PENDING_REVIEW'].includes(status),
);
if (!publish.ok || failed.length > 0) {
  throw new Error(
    `publish refused: ${JSON.stringify(publishResult.statusDetail ?? publishResult)}`,
  );
}

console.log(`published ${version}: ${statuses.join(', ')}`);
if (statuses.includes('ITEM_PENDING_REVIEW')) {
  console.log('the store is reviewing this version; it goes live once that clears');
}
