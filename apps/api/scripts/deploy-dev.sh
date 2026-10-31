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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --filter=':- .gitignore' --exclude '.git/' --exclude '/.claude/' ./ "$TMP/repo/"

echo "Uploading $(du -sh "$TMP/repo" | cut -f1) to api-dev (dev); top level:"
ls -1 "$TMP/repo" | sed 's/^/  /'
if find "$TMP/repo" \( -name '.env' -o -name '.env.*' \) -not -name '.env.example' | grep -q .; then
  echo "An .env file is in the upload set. Stopping." >&2; exit 1
fi
railway up "$TMP/repo" --path-as-root -e dev -s api-dev -c
