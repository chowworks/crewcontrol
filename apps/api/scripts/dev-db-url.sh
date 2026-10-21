#!/usr/bin/env bash
# Prints the shared dev database's public connection strings for apps/api/.env:
#
#   apps/api/scripts/dev-db-url.sh          the owner, for SCHEMA_DATABASE_URL (migrations, the seed, scripts)
#   apps/api/scripts/dev-db-url.sh --app    the restricted role cc_app, for DATABASE_URL (the API itself)
#
# Railway's IaC Postgres has no DATABASE_PUBLIC_URL, so it is built from the dev Postgres's user, password and
# database and its TCP proxy address. Needs the Railway CLI, signed in, with access to the crew-control project.
set -euo pipefail

vars="$(railway variables -s Postgres -e dev --kv)"
get() { grep "^$1=" <<<"$vars" | cut -d= -f2-; }

host="$(get RAILWAY_TCP_PROXY_DOMAIN):$(get RAILWAY_TCP_PROXY_PORT)"
if [[ "${1:-}" == "--app" ]]; then
  # api-dev's own connection is the role on the private network; swap in the public proxy address.
  app="$(railway variables -s api-dev -e dev --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"
  creds="${app#postgresql://}"
  creds="${creds%%@*}"
  echo "postgresql://${creds}@${host}/$(get PGDATABASE)?sslmode=require"
else
  echo "postgresql://$(get PGUSER):$(get PGPASSWORD)@${host}/$(get PGDATABASE)?sslmode=require"
fi
