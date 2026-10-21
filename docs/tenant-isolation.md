# Trip isolation: one trip never sees another's data

An organizer sees their own trips and everything on them (guests, and the people who run the trip with them); they
see nothing of anyone else's trip. Two layers enforce it, and they do different jobs. Same design as Audit
Differently (`audit-differently/docs/tenant-isolation.md`), with the trip where it has the workspace.

| Layer                             | Responsibility                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Database** (row-level security) | The trip line. Whatever the application asks for, Postgres returns only rows of the caller's trips.        |
| **Application**                   | What a person may do inside that line, and which columns a page shows (`toPublicTrip`, `toOrganizerTrip`). |

A mistake in the application's access logic can then expose data only inside one trip, never across.

## What this protects against, and what it does not

Row-level security is a second wall behind the application's own checks. It protects against **logic mistakes**:
a query that forgets its filter, a route that looks a trip up by id without checking whose it is, a role check that
is wrong.

It does not protect against **SQL injection**. The caller's context is a set of settings the API puts on its own
connection, so SQL an attacker controls could set them too. Every query is parameterized, and raw SQL never
interpolates a request value. Treat a raw query that builds SQL from input as a defect.

A policy cannot name columns, so a public page reads no guest row at all. It gets what it may show from
`public_trip_guests(tripId)`: each guest's status, and the name of an approved guest only, for a published trip only.
Which of that the page shows stays the job of `toPublicTrip` and its spec.

## The model

- **The tenant is the trip.** A guest belongs to exactly one trip, and so will everything later hung off a trip
  (rooms, payments, messages). Each such row names its trip itself (`tripId`, a real foreign key), so unlike Audit
  Differently there is no copied tenant column and no `_1_set_tenant` trigger.
- **A trip's people are its `TripMember` rows** (Audit Differently's `Membership`). `userId` is the sign-in
  provider's user id; `role` is `owner` or `organizer`. A person's trips are the trips of their memberships.
- **Memberships are invitations.** Only an owner gives, changes or removes a membership, and only on a trip they
  own; a person with none can give none, so nobody seats themselves. A trip's creator is made its owner in the same
  trusted step that creates the trip (`TripsService.create`).
- **Members read and write the trip and its guests.** Owners alone change the trip's people and delete it. What an
  organizer may do beyond that is the application's rule.
- **What a row belongs to cannot change** (`_3_keep`): a guest cannot move to another trip, a membership cannot
  move to another person or trip.
- **A trip always has an owner** (`TripMember_9_keeps_an_owner`, checked at commit): the last owner cannot step
  down or be removed until another owner is added, in the same transaction or before. Deleting the trip removes
  them all.
- **Only the seed makes a sample trip** (`Trip_4_sample_kept`). The homepage lists sample trips and the dev seed
  deletes and remakes them on every start, so nobody but the tables' owner sets or clears `isSample`.

## How a request works

1. `TenantMiddleware` opens an empty context (`src/core/tenant-context.ts`) for the request.
2. The guard that verifies the caller calls `identifyCaller` before anything else touches the database (and
   `identifyAdmin` after checking the Clerk role, on admin routes). A public route runs its work in `runAsPublic`.
3. `PrismaService` (`src/prisma/prisma.service.ts`) sets transaction-local settings on every query that can reach
   a tenant table: who the caller is, their trips (worked out by the database from `TripMember`), and the marks
   below. Inside `$transaction` the queries join the caller's transaction.
4. Policies (`prisma/migrations/20261021050000_trip_rls`) compare the row's trip with those settings. With no
   settings the caller sees nothing. Reading, inserting, updating and deleting have separate policies: being able
   to see a row never means being able to change it.

**Trusted work** (`runAsSystem`, `app.system`) acts for every trip with no signed-in person. Only creating a trip
(and its first owner) needs it today. `src/core/trusted-paths.spec.ts` lists every call site; a new one is a review
item.

**The public pages** (`runAsPublic`, `app.public`, no person) read published trips, get their guests through
`public_trip_guests`, and add an `interested` guest to a published trip (a sign-up, written with `createMany`
because they cannot read it back). They change nothing else and see no `TripMember` or `Guest` row.
`trusted-paths.spec.ts` lists those call sites too.

**The platform admin** (`app.admin`) is a person whose Clerk `publicMetadata.role` is `admin`, working at the trip
level only, as in Audit Differently: it reads every trip and every trip's people, and gives, changes or removes a
membership on any trip (handing an ownerless trip to its organizer, or seating itself). It changes no trip and
reads no guest through the mark; once seated it works on that trip as a member. The mark counts only beside a
person, never with `app.system`. In dev the seed remakes the sample trips on every start, so a seat on one lasts
until the next deploy.

Open follow-up:

- Audit Differently writes an access-log line whenever the admin changes a workspace's people
  (`Membership_9_admin_logged`). CrewControl has no access log yet; add it before an admin guard ships, since it is
  the safeguard on the admin seating itself and reading guests.

## Switching it on

Row-level security applies whenever the API connects as a restricted role. Connected as the owner (today, in dev)
the policies are skipped and the API is the plain client; it says which at startup. It needs a verified caller
before it is switched on anywhere, or the organizer screens see no trip: the sign-in guard must call
`identifyCaller` and, for admins, `identifyAdmin`.

- **`DATABASE_URL`** becomes the API's connection: the restricted role (`cc_app`), which the policies bind.
- **`SCHEMA_DATABASE_URL`** is the database owner, for anything that changes or reads the schema: the seed and the
  scripts (`scripts/lib/owner-env.ts`), and Prisma's CLI once `directUrl = env("SCHEMA_DATABASE_URL")` is added to
  `schema.prisma`. Add it in the same change that sets the variable everywhere: Prisma's CLI refuses to run while
  `directUrl` names a variable that is not set.

Steps, in order. The scripts that set up the role connect as a superuser (Railway's `postgres` user is one): an
owner with only `CREATEROLE` can create the role but not re-apply its limits on the next run.

1. Sign-in sets the caller (`identifyCaller`, `identifyAdmin`), deployed and working while the API still connects
   as the owner, so nothing changes yet.
2. Seat the existing trips' owners (`TripMember` rows). A trip with no owner row is seen only by the admin once the
   role binds. Count them first: `SELECT id, name FROM "Trip" t WHERE NOT "isSample" AND NOT EXISTS (SELECT 1 FROM
"TripMember" m WHERE m."tripId" = t.id AND m.role = 'owner')`.
3. Then, in one change and one deploy (on Railway, `.railway/railway.ts`): `SCHEMA_DATABASE_URL` set to the owner,
   `directUrl = env("SCHEMA_DATABASE_URL")` in `schema.prisma`, `DATABASE_URL` set to the role with a password you
   choose, `REQUIRE_TENANT_RLS=on`, and `npm run role:ensure` in the start command after `prisma migrate deploy`.
   `role:ensure` (`scripts/ensure-app-role.ts`) creates the role if it is missing and re-applies its grants on every
   deploy. Splitting these takes the API down: `role:ensure` refuses a `DATABASE_URL` that is the owner, and
   `migrate deploy` run as the role cannot create anything.
4. Both URLs carry `?sslmode=require`, as in Audit Differently, whose Railway services connect to the private
   address that way (`SCHEMA_DATABASE_URL: '${{Postgres.DATABASE_URL}}?sslmode=require'`). `role:ensure` refuses a
   non-local URL without it.

`npm run role:create -w @cc/api -- --confirm-host <host>` does the same for a database set up by hand, outside
Railway.

## Adding a table that holds trip data

1. Give it `tripId String` with a foreign key to `Trip` and an index.
2. In its migration: the `_3_keep` trigger for `tripId`, `ENABLE ROW LEVEL SECURITY`, and the four policies on
   `"tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])` (plus `app_is_public()` if a public page needs it).
3. Add it to `TENANT_TABLES` (`src/core/tenant-tables.ts`) and cases to `src/core/tenant-rls.spec.ts`. The spec
   fails while any table with a `tripId` has row-level security off.
4. A new function is executable by everyone until its migration says `REVOKE ALL ON FUNCTION ... FROM PUBLIC`; if
   the API's role needs it, add it to `src/core/app-role-grants.ts`. `app-role.spec.ts` fails on one left open.

## Tests

`src/core/tenant-rls.spec.ts` runs the real migrations on Postgres (PGlite), as the restricted role with exactly its
real privileges: isolation between trips, owners and organizers, the trusted, admin and public marks, and
fail-closed behaviour. `src/core/app-role.spec.ts` checks the role can execute nothing it should not. They run with
`npm test`, which sets the Node flag they need; in CI a run without the flag fails instead of skipping.

## Cost

With the restricted role, a query that can reach a trip table runs in its own short transaction: begin, set the
context, query, commit, which is four round trips instead of one. Every table here is a tenant table, so that is
every query; the cost is large over a slow connection and small on the platform's own network.
