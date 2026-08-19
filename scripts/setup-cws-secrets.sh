#!/bin/bash
#
# Put the four Chrome Web Store credentials into the repository's Actions secrets.
#
# Three of them can only come from you: the item id is in your dashboard URL, and the
# OAuth client id and secret come from a client you create in Google Cloud Console,
# signed in as the account that owns the store listing. No API creates an OAuth
# client, so that part cannot be scripted. Everything after it is, including the
# refresh token, which this mints and stores without ever printing it.
#
# Usage:
#   scripts/setup-cws-secrets.sh <extension-id> <client-id> [client-secret]
#
# Prefer leaving the secret off the command line and letting the prompt take it, so it
# reaches neither your shell history nor the process list.
set -euo pipefail

repo="${CWS_SECRET_REPO:-TheGlitching/Squiggle}"

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  cat >&2 <<'EOF'
usage: scripts/setup-cws-secrets.sh <extension-id> <client-id> [client-secret]

  extension-id   from the dashboard URL of your item
  client-id      Google Cloud Console -> Credentials -> OAuth client (Web application)
  client-secret  shown beside the client id; omit it and you will be prompted

The consent screen must be in Production. Left in Testing, Google issues refresh
tokens that expire after seven days, so the pipeline breaks a week later on an
error that says nothing about the cause.
EOF
  exit 64
fi

extension_id="$1"
client_id="$2"

if [ "$#" -eq 3 ]; then
  client_secret="$3"
else
  read -r -s -p "Client secret (not echoed): " client_secret
  echo
fi

[ -n "$extension_id" ] || { echo "the extension id is empty" >&2; exit 64; }
[ -n "$client_id" ] || { echo "the client id is empty" >&2; exit 64; }
[ -n "$client_secret" ] || { echo "the client secret is empty" >&2; exit 64; }

command -v gh >/dev/null || { echo "gh is not installed" >&2; exit 69; }
command -v node >/dev/null || { echo "node is not installed" >&2; exit 69; }

if [ -z "${GH_TOKEN:-}" ]; then
  GH_TOKEN="$(gh auth token)"
  export GH_TOKEN
fi

echo "Minting a refresh token. Open the URL below and approve as the account that"
echo "owns the store listing."
echo

token_log="$(mktemp -t cws-token)"
chmod 600 "$token_log"
trap 'rm -f "$token_log"' EXIT

# The secret goes through the environment: node's argv is world-readable in the
# process list. The helper prints the consent URL and then the token, so the token
# is filtered out of what reaches the terminal while the log keeps it for us.
CWS_CLIENT_SECRET="$client_secret" node scripts/cws-refresh-token.mjs "$client_id" \
  >"$token_log" 2>&1 &
helper=$!

# Surface the helper's output as it arrives, minus everything from the token header on.
tail -f "$token_log" 2>/dev/null | sed -n '/^CWS_REFRESH_TOKEN:/q; p' &
follower=$!

wait "$helper" || { kill "$follower" 2>/dev/null || true; echo "the helper failed" >&2; exit 1; }
kill "$follower" 2>/dev/null || true
wait "$follower" 2>/dev/null || true

refresh_token="$(awk '/^CWS_REFRESH_TOKEN:/{found=1; next} found && NF {print; exit}' "$token_log")"

if [ -z "$refresh_token" ]; then
  echo >&2
  echo "No refresh token in the helper's output, so nothing was stored." >&2
  echo "A consent screen still in Testing is the usual cause." >&2
  exit 1
fi

echo
echo "Storing four secrets on $repo"

# --body is omitted deliberately: gh reads the value from stdin only when it is
# absent. Passing `--body -` stores the literal string "-", and every check below
# would still pass while the pipeline authenticated with a hyphen.
set_secret() {
  printf '%s' "$2" | gh secret set "$1" -R "$repo"
  echo "  $1"
}

set_secret CWS_EXTENSION_ID "$extension_id"
set_secret CWS_CLIENT_ID "$client_id"
set_secret CWS_CLIENT_SECRET "$client_secret"
set_secret CWS_REFRESH_TOKEN "$refresh_token"

echo
count="$(gh secret list -R "$repo" | grep -c '^CWS_' || true)"
if [ "$count" -ne 4 ]; then
  echo "Expected four CWS_ secrets on $repo, found $count." >&2
  exit 1
fi

# Names prove nothing about values, so spend one real call: this is the exchange the
# release performs first, and the only way to learn now rather than mid-publish that
# the credentials do not work together.
echo "Checking the credentials against Google"
if ! printf '%s' "$(
  curl -s -X POST https://oauth2.googleapis.com/token \
    -d client_id="$client_id" \
    -d client_secret="$client_secret" \
    -d refresh_token="$refresh_token" \
    -d grant_type=refresh_token
)" | grep -q access_token; then
  echo "Google refused the stored credentials, so the release would fail too." >&2
  exit 1
fi

echo "Four secrets in place and Google accepts them. The pipeline can publish."
