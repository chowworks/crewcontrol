# Developing Travel HQ

## What you need

- Node 22 (`.nvmrc`) and npm.
- The Railway CLI, signed in with access to the `crew-control` project. There is no local database: the API on
  your laptop uses the shared dev database on Railway (see "The shared dev environment" below).

## First run

```sh
npm install
railway link -p crew-control -e dev
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
apps/api/scripts/dev-db-url.sh --app      # paste as DATABASE_URL in apps/api/.env (the restricted role)
apps/api/scripts/dev-db-url.sh            # paste as SCHEMA_DATABASE_URL (the owner: migrations, the seed)
npm run dev                               # api on :3000, web on :5173
```

The dev database already has the demo trips (`api-dev` seeds them on every deploy), so there is nothing to
migrate or seed.

Then open:

- http://localhost:5173/t/mv-beach-house-2027 for the house trip as a guest sees it.
- http://localhost:5173/t/aruba-2028 for the resort trip.
- http://localhost:5173/t/tulum-40th-2027 for the villa trip, with real photos.
- http://localhost:5173/ for the marketing homepage.
- http://localhost:5173/organize for the organizer's trip list and editor.

## Ports

`npm run dev` uses the defaults in the `.env.example` files (api 3000, web 5173). `.claude/launch.json` runs
the same apps on 3200 and 5373 instead, so Travel HQ can run beside Interview and Audit Differently. If you
use those, set `PORT` and `FRONTEND_URL` in `apps/api/.env` and `VITE_API_URL` in
`apps/web/.env` to match.

## Layout

| Path             | What it is                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| `apps/api`       | NestJS API, Prisma, Postgres. Railway builds it from the repo root.    |
| `apps/web`       | Vite + React + Tailwind. Guest trip page and organizer editor. Vercel. |
| `packages/types` | Shared types. The API keeps a generated copy (see below).              |
| `.railway`       | Railway services and variables, declared in code.                      |

## Changing shared types

Edit `packages/types/src/index.ts`, then `npm run sync:types -w @cc/api`. The API carries a copy, from when its
Railway build saw only `apps/api`, at `apps/api/src/trips/trip-types.ts`; a test fails if the two differ.

## Changing the database

Edit `apps/api/prisma/schema.prisma`, then write the migration from the difference between the dev database and
your schema. It only reads the database:

```sh
cd apps/api
mkdir -p prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<name>
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<that folder>/migration.sql
```

Never add `--from-migrations` or `--shadow-database-url` pointing at the dev database: Prisma wipes a shadow
database. Read the SQL, then apply it with `npm run db:migrate:deploy -w @cc/api` (or `deploy-dev.sh`). Never run
`prisma migrate dev` or `migrate reset`: they need a database of their own and would wipe the shared one.
Production applies migrations with `prisma migrate deploy` on start.

The API runs the seed on every start, in dev and production, so check the seed still runs after a schema change.

## Photos

Uploads go to a private Cloudflare R2 bucket, one per environment (`R2_*` in `apps/api/.env.example`). A trip keeps
each photo's reference (`r2:trip-photos/<name>`); the API hands readers signed links that last two hours, and
browsers load the photos from Cloudflare, never through the API (`src/photos/photo-bucket.ts`). A laptop uses the
dev bucket's values; without them, uploading a photo says it is not set up. Seed trips use the placeholder images
in `apps/web/public/seed/`.

To make a bucket: in Cloudflare, create the R2 bucket (for dev, `crewcontrol-photos-dev`) and leave public access
off, then create an R2 API token with Object Read & Write on that bucket only. Set `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_PHOTOS_BUCKET` on the API service in Railway.

## Forwarded receipts

Each trip has its own address (`<name>@RECEIPTS_DOMAIN`) that guests and organizers forward payment emails to
(issue #12). Resend receives the mail and calls the existing webhook (`/api/webhooks/resend`) with `email.received`;
the API queues it and a worker inside the API reads it every 30 seconds (`src/receipts/`). Without
`RECEIPTS_DOMAIN` and `RESEND_RECEIVING_API_KEY` receiving is off, as it is on a laptop.

To switch it on for an environment, in that environment's Resend account:

1. Add the receiving subdomain (dev: `receipts.dev.travel-hq.app`, production: `receipts.travel-hq.app`) under
   Receiving, and add the MX record Resend shows at the DNS host. Use a subdomain so the main domain's mail is untouched.
2. On the existing webhook, also tick `email.received`.
3. Create an API key with Full access (a sending-only key can't read received mail).
4. Set `RECEIPTS_DOMAIN` and `RESEND_RECEIVING_API_KEY` on the API service in Railway (both are declared in
   `.railway/railway.ts`).

The Admin toolbox's Forwarded receipts page lists every email received and every address a trip has used.

## The shared dev environment (Railway)

Travel HQ has a `dev` environment on Railway, set up the way Interview and Audit Differently's are: a Postgres
that holds the three fictional demo trips and nothing else, and an API beside it, `api-dev`. A laptop can develop
against that database, a branch can be tried on Railway before it reaches production, and the seed runs there.

### What it is

- **`Postgres` in Railway's `dev` environment**, declared in `.railway/railway.ts`, with a public TCP proxy so a
  laptop can reach it. Production's Postgres has no public address.
- **`api-dev`**, on Railway's private network with a public domain. It has no GitHub source. CI deploys `main` to
  it once deploys are switched on, and `apps/api/scripts/deploy-dev.sh` deploys the working tree you are on,
  uncommitted changes included.
- **The seed runs on every `api-dev` start** (`prisma migrate deploy && npm run db:seed && node dist/main.js`), so
  each deploy puts the demo trips back in their starting shape. Edits to other trips are kept.
- **No secrets.** Every variable but `FRONTEND_URL` is set in `.railway/railway.ts`; photos go to the dev R2 bucket.

### Set it up (once per project)

Done for `crew-control` on 2026-10-18; kept here for a rebuild.

1. Create the Railway project `crew-control` and its `dev` environment: `railway init`, then
   `railway environment new dev`. IaC can't create an environment.
2. From the repository root (after `npm install`, which brings the `railway` SDK):
   `railway link -p crew-control -e dev`, `railway config plan`, then `railway config apply --environment dev`.
3. Give `api-dev` a public domain: `railway domain -s api-dev -e dev`.
4. Set its one hand-set value, the web app's address for CORS:
   `railway variables -s api-dev -e dev --set FRONTEND_URL=http://localhost:5373` (or the Vercel address).
5. Deploy: `apps/api/scripts/deploy-dev.sh`, then `curl https://<domain>/api/health`.
6. For CI: create a project token scoped to `dev` and add it as the repository secret `RAILWAY_TOKEN`, set the
   repository variable `RAILWAY_API_SERVICE=api-dev`, and `DEPLOY_ENABLED=true` once Vercel's secrets exist too.

### Every day

Your laptop's API runs against the dev database as the restricted role, so row-level security applies exactly as
on Railway: `apps/api/scripts/dev-db-url.sh --app` prints its address for `DATABASE_URL`, and
`apps/api/scripts/dev-db-url.sh` the owner's for `SCHEMA_DATABASE_URL` (Prisma's CLI and the seed use that one).

The database is shared, so:

- Apply a new migration by deploying `api-dev` (it migrates, then `role:ensure` re-applies the role's grants), or
  with `npm run db:migrate:deploy -w @cc/api` followed by `npm run role:ensure -w @cc/api`. Never
  `prisma migrate dev` or `migrate reset` against it; write migrations with `prisma migrate diff` (above).
- Reseeding replaces the demo trips for everyone, so say so first. The seed refuses a database that is not on
  your machine until you name it: `npm run db:seed -w @cc/api -- --confirm-host <host:port>`.

### Production

Declared in the same file: `NODE_ENV=production` and no TCP proxy on Postgres. The seed runs on start, as in dev, so
the homepage's demo trips are there; it replaces only trips marked `isSample`, so a trip an organizer made is never
touched. It refuses any Railway environment but `dev` and `production`.

A push to `main` deploys production: CI holds production's `RAILWAY_TOKEN`, applies `.railway/railway.ts` there and
deploys `crewcontrol-api` (`RAILWAY_API_SERVICE`). Dev is deployed by hand: try a branch on `api-dev` with
`apps/api/scripts/deploy-dev.sh`, and apply dev's half of the file with `railway config apply --environment dev`.

## Checks (what CI runs)

```sh
npm run lint
npm run format:check      # npm run format to fix
npm run typecheck
npm run build
npm run test
```
