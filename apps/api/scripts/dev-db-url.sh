#!/usr/bin/env bash
# Prints the shared dev database's public connection string, for DATABASE_URL in apps/api/.env.
#
#   apps/api/scripts/dev-db-url.sh
#
# Railway's IaC Postgres has no DATABASE_PUBLIC_URL, so it is built from the dev Postgres's user, password and
# database and its TCP proxy address. Needs the Railway CLI, signed in, with access to the crew-control project.
set -euo pipefail

vars="$(railway variables -s Postgres -e dev --kv)"
get() { grep "^$1=" <<<"$vars" | cut -d= -f2-; }

echo "postgresql://$(get PGUSER):$(get PGPASSWORD)@$(get RAILWAY_TCP_PROXY_DOMAIN):$(get RAILWAY_TCP_PROXY_PORT)/$(get PGDATABASE)"
