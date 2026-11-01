#!/usr/bin/env bash
# Deploys the current working tree of apps/api to the shared dev API (Railway `dev`, service `api-dev`).
#
#   apps/api/scripts/deploy-dev.sh
#
# The service builds from the repository root (.railway/railway.ts), so the whole working tree is the upload, as in
# Audit Differently. A clean copy is uploaded rather than the folder itself: whatever .gitignore leaves out (node_modules,
# build output, .env files) stays out, and uncommitted changes are included, so you test exactly what you have. Its
# start command runs the migrations and the seed, so the dev database gets this tree's migrations and the demo trips
# go back to their starting shape.
set -euo pipefail
cd "$(dirname "$0")/../../.."

# `railway up` deploys to whatever project this folder is linked to, and from an unlinked folder it makes a new one
# (a stray project named "repo", 2026-10-31). So stop unless this folder is linked to Travel HQ's project, environment
# dev. The project is checked by its id, which survives a rename.
PROJECT_ID='ab2f90a6-907a-4add-961a-e8774e9f7615'
STATUS="$(railway status 2>&1 || true)"
LINKED_PROJECT="$(awk '/^Project ID:/ { print $3 }' <<<"$STATUS")"
LINKED_ENV="$(awk '/^Environment:/ { print $2 }' <<<"$STATUS")"
if [[ "$LINKED_PROJECT" != "$PROJECT_ID" || "$LINKED_ENV" != dev ]]; then
  echo "This folder ($PWD) is not linked to Travel HQ's Railway project, environment dev. Stopping." >&2
  echo "railway status says:" >&2
  sed 's/^/  /' <<<"$STATUS" >&2
  echo "Link it with: railway link -p $PROJECT_ID -e dev" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --filter=':- .gitignore' --exclude '.git/' --exclude '/.claude/' ./ "$TMP/repo/"

echo "Uploading $(du -sh "$TMP/repo" | cut -f1) to api-dev (dev); top level:"
ls -1 "$TMP/repo" | sed 's/^/  /'
if find "$TMP/repo" \( -name '.env' -o -name '.env.*' \) -not -name '.env.example' | grep -q .; then
  echo "An .env file is in the upload set. Stopping." >&2; exit 1
fi
railway up "$TMP/repo" --path-as-root -e dev -s api-dev -c
