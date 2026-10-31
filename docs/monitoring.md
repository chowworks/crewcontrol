# Uptime monitoring and the status page (Better Stack)

Better Stack Uptime checks the API's public health route and shows it on Travel HQ's own status page
at `https://status.travel-hq.app` (Better Stack subdomain `travel-hq`, not the `chow-works` page the Differently
products share). What it checks lives in code, `ops/monitoring.ts`,
and CI applies it with `scripts/betterstack-sync.ts`. Copied from Audit Differently's setup.

## What is checked

| Monitor                                 | Route                           | Down when                                                  |
| --------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Travel HQ · Server errors (last 15 min) | `GET /api/health/server-errors` | any request was answered with a 5xx in the last 15 minutes |

It counts rows in the `ServiceFailure` table (`apps/api/src/core/service-failure-log.ts`, migration
`20261031020000`), written by the global `ServerErrorFilter` for every 5xx the API answers. A row is when, which kind
and the route pattern (`POST /api/join/:slug`), never a trip, a person, an email or an error message; the reason is in
the API's log. Rows older than 30 days are deleted.

It is a "status code 2xx" monitor (the route answers 503 when there was a failure, or when the count cannot be read),
every 5 minutes, alerting the team by email, in the monitor group "Travel HQ", with a row of the same name in the
"Travel HQ" section of the status page. The route says only `status`, `failures` and `windowMinutes`, and its result
is reused for a minute. `GET /api/health` (the API is up) is not monitored: the check fails when the API or its
database does not answer.

The address checked is production's API, `https://api.travel-hq.app` (`API_URL` in the `betterstack` job of
`.github/workflows/ci.yml`), since CI deploys only production.

To add a check, see "Health checks and monitoring" in `CLAUDE.md`.

## How the sync works

The `betterstack` job in `.github/workflows/ci.yml` runs on pushes to main that deploy, after the API deploy.

- **The monitor group** is matched by name and created if missing.
- **Monitors** are matched by URL, or by name when only the URL changed. Missing ones are created; the name, URL,
  check type, email alerts, frequency and group are put back if they differ (other settings, such as SMS or an
  escalation policy, are left alone).
- **The status page** is matched by subdomain (`travel-hq`) and never renamed; it is created only if missing. Its
  logos (light and dark) and its custom domain, `status.travel-hq.app`, are set by hand in Better Stack, with the DNS
  record it asks for.
- **Our section** is matched by title; **rows** by the monitor they show.
- **Nothing is deleted.** A monitor on our API or in our group, or a row in our section, that is not in the list is
  printed as "not in ops/monitoring.ts". Other products' sections and rows are not ours and are not touched.

Without `BETTERSTACK_API_TOKEN` it prints that it skipped and exits 0.

## Setting it up (owner, once)

1. In Better Stack, use a team-scoped Uptime API token (API tokens → Team-based tokens → Uptime API tokens). The
   one Audit Differently uses works if it is for the same team.
2. Add it to this repository as the Actions secret `BETTERSTACK_API_TOKEN` (Settings → Secrets and variables →
   Actions). Never in the repository, `.railway/railway.ts` or Railway: only CI uses it.
3. Run a dry run (below), then push to main or re-run the latest main CI run.

## A dry run on your machine

Lists what the sync would create or update without changing anything (it still reads the account):

```bash
read -rs BETTERSTACK_API_TOKEN && export BETTERSTACK_API_TOKEN   # paste the token; it is not echoed or kept
API_URL=https://api.travel-hq.app npm run betterstack:sync -- --dry-run
```

The planning logic is tested with the API stubbed: `npm run test:scripts`.
