# Developing CrewControl

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
apps/api/scripts/dev-db-url.sh            # paste the output as DATABASE_URL in apps/api/.env
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
the same apps on 3200 and 5373 instead, so CrewControl can run beside Interview and Audit Differently. If you
use those, set `PORT`, `FRONTEND_URL` and `API_PUBLIC_URL` in `apps/api/.env` and `VITE_API_URL` in
`apps/web/.env` to match.

## Layout

| Path             | What it is                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| `apps/api`       | NestJS API, Prisma, Postgres. Deployed to Railway from this folder.    |
| `apps/web`       | Vite + React + Tailwind. Guest trip page and organizer editor. Vercel. |
| `packages/types` | Shared types. The API keeps a generated copy (see below).              |
| `.railway`       | Railway services and variables, declared in code.                      |

## Changing shared types

Edit `packages/types/src/index.ts`, then `npm run sync:types -w @cc/api`. The API's Railway build only sees
`apps/api`, so it carries a copy at `apps/api/src/trips/trip-types.ts`; a test fails if the two differ.

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

The dev API (`api-dev`) runs the seed on every start, so check the seed still runs after a schema change.
Production does not seed.

## Photos

Uploads are saved to `UPLOAD_DIR` (default `apps/api/storage/uploads`, gitignored) and served from
`/uploads/`. Seed trips use the placeholder images in `apps/web/public/seed/`.

## The shared dev environment (Railway)

CrewControl has a `dev` environment on Railway, set up the way Interview and Audit Differently's are: a Postgres
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
- **No secrets.** Every variable but `FRONTEND_URL` is set in `.railway/railway.ts`; photos go to a volume.

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

Your laptop's API runs against the dev database: `apps/api/scripts/dev-db-url.sh` prints its address for
`DATABASE_URL` in `apps/api/.env`.

The database is shared, so:

- Apply a new migration with `npm run db:migrate:deploy -w @cc/api` (or deploy `api-dev`, which does it). Never
  `prisma migrate dev` or `migrate reset` against it; write migrations with `prisma migrate diff` (above).
- Reseeding replaces the demo trips for everyone, so say so first. The seed refuses a database that is not on
  your machine until you name it: `npm run db:seed -w @cc/api -- --confirm-host <host:port>`.

### Production

Declared in the same file: the GitHub source, `NODE_ENV=production`, no TCP proxy on Postgres, and no seed in the
start command, so a trip an organizer made is never replaced by it. The seed refuses to run in any Railway
environment but `dev`. When production exists, CI is pointed at it by swapping `RAILWAY_TOKEN` for a production
token and `RAILWAY_API_SERVICE` for `crewcontrol-api`.

## Checks (what CI runs)

```sh
npm run lint
npm run format:check      # npm run format to fix
npm run typecheck
npm run build
npm run test
```
