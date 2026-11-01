-- What organizers change goes in the trip log (owner's decision, 2026-11-01): a trip can have more than one owner, and
-- each should see what the others did. A 'change' line keeps who did it, whether they were the admin, and what changed
-- in plain words ("details", a TripChange). Lines are only ever added, as before; the trip log shows one person's
-- editor saves close together as one line.
SET lock_timeout = '10s';

ALTER TABLE "TripLog" ADD COLUMN "details" JSONB;
ALTER TABLE "TripLog" ADD COLUMN "byAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TripLog" DROP CONSTRAINT "TripLog_kind_check";
ALTER TABLE "TripLog" ADD CONSTRAINT "TripLog_kind_check" CHECK ("kind" IN ('email_refused', 'change'));

-- A change, written as the signed-in caller: one of the trip's people, or the admin. Nobody writes the table directly.
CREATE FUNCTION "log_trip_change"(trip_id TEXT, change JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  IF NOT "app_is_admin"() AND NOT EXISTS (
    SELECT 1 FROM "TripMember" m WHERE m."tripId" = trip_id AND m."userId" = "app_user_id"()
  ) THEN
    RAISE EXCEPTION 'Not on this trip' USING ERRCODE = '42501';
  END IF;
  INSERT INTO "TripLog" ("tripId", "kind", "actorUserId", "details", "byAdmin")
  VALUES (trip_id, 'change', "app_user_id"(), change, "app_is_admin"());
END $$;
REVOKE ALL ON FUNCTION "log_trip_change"(TEXT, JSONB) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "log_trip_change"(TEXT, JSONB) TO cc_app;
  END IF;
END $$;
