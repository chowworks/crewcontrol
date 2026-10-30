-- Deleting a trip (issue #2): an owner deletes it, it is hidden at once and erased for good 30 days later; until then
-- an owner can restore it, and the admin still sees it in the Admin toolbox (owner's decision, 2026-10-30). The API's
-- hourly run erases what is due (TripDeletionService.purge), as trusted work.
SET lock_timeout = '10s';

ALTER TABLE "Trip" ADD COLUMN "deletedAt" TIMESTAMP(3),
                   ADD COLUMN "deletedByUserId" TEXT;

-- A deleted trip is never published, so its trip page, join page and sign-ups are gone with it.
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_deleted_unpublished_check" CHECK ("deletedAt" IS NULL OR NOT "published");

-- A deleted trip is nobody's trip: its members lose it, and with it every row on it, until it is restored. The admin
-- (app_is_admin) and trusted work (all_trip_ids) still read it.
CREATE OR REPLACE FUNCTION "trips_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT m."tripId"), ARRAY[]::TEXT[])
    FROM "TripMember" m JOIN "Trip" t ON t."id" = m."tripId"
   WHERE m."userId" = uid AND t."deletedAt" IS NULL
$$;

-- Only an owner deletes a trip, as only an owner could erase one before. Restoring is trusted work (the trip is no
-- longer the owner's to read), after the API checked the caller owns it. Not SECURITY DEFINER, so current_user is the
-- role that writes; the tables' owner (migrations, the seed) may.
CREATE FUNCTION "trip_deleted_by_owner"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"
     AND NOT "app_is_system"()
     AND NOT (NEW."id" = ANY ("app_owned_trip_ids"()))
     AND NOT pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RAISE EXCEPTION 'Only the trip''s owners delete or restore it' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Trip_5_deleted_by_owner" BEFORE UPDATE ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "trip_deleted_by_owner"();
REVOKE ALL ON FUNCTION "trip_deleted_by_owner"() FROM PUBLIC;

CREATE INDEX "Trip_deletedAt_idx" ON "Trip"("deletedAt");

-- The hourly run erases a deleted trip once its 30 days are up: trusted work may delete a trip, but only a deleted one.
DROP POLICY "tenant_delete" ON "Trip";
CREATE POLICY "tenant_delete" ON "Trip" FOR DELETE
  USING ("id" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[])
         OR ((SELECT "app_is_system"()) AND "deletedAt" IS NOT NULL));
