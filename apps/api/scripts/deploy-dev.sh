#!/usr/bin/env bash
# Deploys the current working tree of apps/api to the shared dev API (Railway `dev`, service `api-dev`).
#
#   apps/api/scripts/deploy-dev.sh
#
# The service builds from apps/api alone (.railway/railway.ts), so that folder is the upload. A clean copy is
# uploaded rather than the folder itself: no node_modules, build output, .env files or local photo uploads, and
# uncommitted changes are included, so you test exactly what you have. Its start command runs the migrations and
# the seed, so the dev database gets this tree's migrations and the demo trips go back to their starting shape.
set -euo pipefail
cd "$(dirname "$0")/../../.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a \
  --exclude 'node_modules/' --exclude 'dist/' --exclude '.env' --exclude '.env.*' --exclude '/storage/' \
  apps/api/ "$TMP/api/"
if find "$TMP/api" \( -name '.env' -o -name '.env.*' \) -not -name '.env.example' | grep -q .; then
  echo "An .env file is in the upload set. Stopping." >&2; exit 1
fi

echo "Uploading $(du -sh "$TMP/api" | cut -f1) to api-dev (dev)..."
railway up "$TMP/api" --path-as-root -e dev -s api-dev -c
