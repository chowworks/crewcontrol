-- Every change to a trip's people goes in its log, an owner's as well as the admin's (owner's decision, 2026-10-28,
-- with the trip's People screen). "byAdmin" tells them apart: the trip log names an owner and says "An admin" for the
-- admin. Lines written before this were all the admin's. Trusted work (a new trip's first owner) and the seed have no
-- person, and a trip being deleted takes its people with it: neither is logged.
SET lock_timeout = '10s';

ALTER TABLE "AccessLog" ADD COLUMN "byAdmin" BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION "trip_member_admin_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD;
BEGIN
  IF "app_user_id"() IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW."role" IS NOT DISTINCT FROM OLD."role" THEN RETURN NULL; END IF;
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."id" = r."tripId") THEN RETURN NULL; END IF;
  INSERT INTO "AccessLog" ("tripId", "actorUserId", "action", "subjectUserId", "role", "oldRole", "byAdmin")
  VALUES (r."tripId", "app_user_id"(), lower(TG_OP), r."userId",
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."role" END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."role" END,
          "app_is_admin"());
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "trip_member_admin_logged"() FROM PUBLIC;
