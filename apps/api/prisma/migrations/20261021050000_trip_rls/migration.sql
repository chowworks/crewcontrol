-- Trip isolation (docs/tenant-isolation.md), the Audit Differently model with the trip as the tenant. A trip's
-- people are its TripMember rows: an owner runs the trip and decides who else organizes it, an organizer works on
-- it beside them. Every query the API makes carries transaction-local settings:
--   app.user_id   who the caller is
--   app.trip_ids  the trips the caller is a member of (comma separated), worked out from TripMember per query
--   app.system    'on' for trusted work (runAsSystem): every trip, no person
--   app.admin     'on' for the platform admin (Clerk publicMetadata.role = 'admin'), beside their own user id
--   app.public    'on' for the public pages (runAsPublic): published trips only, no person
-- A row is visible to the members of its trip and to nobody else. With no settings the caller sees nothing. The
-- policies only bind the restricted role the API connects as (scripts/create-app-role.ts): superusers, roles with
-- BYPASSRLS and the tables' owner (migrations, the seed, scripts) are never subject to them, and the API checks at
-- startup which role it connected as (REQUIRE_TENANT_RLS=on refuses to run as one that bypasses them).
SET lock_timeout = '10s';

-- Nothing the restricted role can create in its own session may stand in for a real table or function.
DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$;

-- ── Who works on a trip ──────────────────────────────────────────────────────

CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An owner runs the trip and its people; an organizer works on it (packages/types TripRole).
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_role_check" CHECK ("role" IN ('owner', 'organizer'));

-- ── The caller's context ─────────────────────────────────────────────────────

CREATE FUNCTION "app_user_id"() RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION "app_trip_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.trip_ids', true), ''), ','), ARRAY[]::TEXT[])
$$;

-- The marks count only in the shape they are set in: trusted work has no person; the admin is always a person;
-- the public pages have no person and are never trusted work.
CREATE FUNCTION "app_is_system"() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.system', true), '') = 'on' AND "app_user_id"() IS NULL
$$;

CREATE FUNCTION "app_is_admin"() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.admin', true), '') = 'on' AND "app_user_id"() IS NOT NULL
$$;

CREATE FUNCTION "app_is_public"() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.public', true), '') = 'on' AND "app_user_id"() IS NULL
     AND NOT "app_is_system"()
$$;

-- Worked out by the database from TripMember when the API opens a query, so a member added or removed applies to
-- the next query. These read across trips, so only the owner and the role granted in scripts/create-app-role.ts
-- may call them.

-- Every trip: what trusted work is given.
CREATE FUNCTION "all_trip_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "Trip"
$$;

-- The trips a person works on.
CREATE FUNCTION "trips_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "tripId"), ARRAY[]::TEXT[]) FROM "TripMember" WHERE "userId" = uid
$$;

-- The trips the caller owns: the ones whose people they may change, and that they may delete.
CREATE FUNCTION "app_owned_trip_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "tripId"), ARRAY[]::TEXT[]) FROM "TripMember"
  WHERE "userId" = "app_user_id"() AND "role" = 'owner' AND "tripId" = ANY ("app_trip_ids"())
$$;

REVOKE ALL ON FUNCTION "all_trip_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "trips_of_user"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_owned_trip_ids"() FROM PUBLIC;

-- ── What a row belongs to cannot be re-pointed ───────────────────────────────
-- Every trip row names its trip itself (a real foreign key), so there is no tenant column to copy from a parent
-- the way Audit Differently copies workspaceId. Arguments: the columns that may not change.
CREATE FUNCTION "forbid_reparent"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) ->> col) IS DISTINCT FROM (to_jsonb(OLD) ->> col) THEN
      RAISE EXCEPTION '%.% cannot be changed', TG_TABLE_NAME, col USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER "TripMember_3_keep" BEFORE UPDATE ON "TripMember"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'userId');
CREATE TRIGGER "Guest_3_keep" BEFORE UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId');

REVOKE ALL ON FUNCTION "forbid_reparent"() FROM PUBLIC;

-- ── Policies ─────────────────────────────────────────────────────────────────
-- The context functions are wrapped in (SELECT ...) so Postgres evaluates them once per statement, not once per
-- row. One policy per command: being able to see a row never means being able to change it.

ALTER TABLE "Trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;

-- A trip is visible to its members, to trusted work and the admin, and to the public pages once published. Only
-- trusted work creates one, because its creator cannot see it until their owner row exists: the API writes both
-- as one trusted step (TripsService.create). Members edit it; owners delete it.
CREATE POLICY "tenant_read" ON "Trip" FOR SELECT
  USING ("id" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"())
         OR ((SELECT "app_is_public"()) AND "published"));
CREATE POLICY "tenant_insert" ON "Trip" FOR INSERT
  WITH CHECK ((SELECT "app_is_system"()));
CREATE POLICY "tenant_update" ON "Trip" FOR UPDATE
  USING ("id" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("id" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "Trip" FOR DELETE
  USING ("id" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]));

-- A membership is an invitation to work on a trip. Members see who works beside them and a person sees their own;
-- only an owner gives, changes or takes one away, and only on a trip they own. A person with none can give none, so
-- nobody seats themselves (a trip's creator is made its owner as trusted work). The platform admin, at the trip
-- level only, sees every trip's people and may seat anyone, itself included, to hand a trip to its organizer.
CREATE POLICY "tenant_read" ON "TripMember" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"())
         OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripMember" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_update" ON "TripMember" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()))
  WITH CHECK ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_delete" ON "TripMember" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()));

-- Guests are their trip's members' to read and write; the admin's mark reaches no guest (it seats itself to see
-- them). The public pages read no guest row: a policy cannot name columns, so reading rows would hand them every
-- guest's email and phone. They get what the page may show from public_trip_guests (below), and add only an
-- interested guest to a published trip: a sign-up, written without reading it back (createMany).
CREATE POLICY "tenant_read" ON "Guest" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "Guest" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ((SELECT "app_is_public"()) AND "status" = 'interested'
                  AND EXISTS (SELECT 1 FROM "Trip" t WHERE t."id" = "tripId" AND t."published")));
CREATE POLICY "tenant_update" ON "Guest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "Guest" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- What a published trip's page may know of its guests: each one's status, and the name of an approved guest only.
-- Never an email or a phone, never the name of someone who only registered interest. Which of this the page shows
-- (counts, and "First L." names when the organizer turns them on) is decided in toPublicTrip. A draft has none.
CREATE FUNCTION "public_trip_guests"(trip_id TEXT)
RETURNS TABLE ("status" TEXT, "firstName" TEXT, "lastName" TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."status",
         CASE WHEN g."status" = 'approved' THEN g."firstName" END,
         CASE WHEN g."status" = 'approved' THEN g."lastName" END
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
   WHERE g."tripId" = trip_id AND t."published"
   ORDER BY g."createdAt"
$$;
REVOKE ALL ON FUNCTION "public_trip_guests"(TEXT) FROM PUBLIC;

-- Only the seed makes a sample trip: the homepage lists them, and the dev seed deletes and remakes every one on each
-- start, so a real trip marked as a sample would be shown to everyone and then lost with its guests. Nobody but the
-- tables' owner (migrations, the seed) sets or clears the mark. Not SECURITY DEFINER, so current_user is the role
-- that writes.
CREATE FUNCTION "trip_sample_kept"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW."isSample"
      OR TG_OP = 'UPDATE' AND NEW."isSample" IS DISTINCT FROM OLD."isSample")
     AND NOT pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RAISE EXCEPTION 'Only the seed marks a trip as a sample' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Trip_4_sample_kept" BEFORE INSERT OR UPDATE ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "trip_sample_kept"();
REVOKE ALL ON FUNCTION "trip_sample_kept"() FROM PUBLIC;

-- A trip always has an owner: at commit, a membership changed away from owner or removed must leave another owner on
-- its trip, unless the trip itself is gone. Deferred, so an owner can hand the trip over (add the new owner, then
-- step down) in one transaction. Runs as the function's owner because the check must see every membership.
CREATE FUNCTION "trip_keeps_an_owner"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD."role" = 'owner'
     AND EXISTS (SELECT 1 FROM "Trip" t WHERE t."id" = OLD."tripId")
     AND NOT EXISTS (SELECT 1 FROM "TripMember" m WHERE m."tripId" = OLD."tripId" AND m."role" = 'owner') THEN
    RAISE EXCEPTION 'Trip % would be left with no owner', OLD."tripId" USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "TripMember_9_keeps_an_owner" AFTER UPDATE OR DELETE ON "TripMember"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "trip_keeps_an_owner"();
REVOKE ALL ON FUNCTION "trip_keeps_an_owner"() FROM PUBLIC;
