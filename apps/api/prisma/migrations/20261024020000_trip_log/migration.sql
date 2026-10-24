-- The trip log (owner's decision, 2026-10-24): what the trip's organizers should know beyond a guest's own history.
-- For now, each time a signed-in person's join was refused because the email they gave is already on the trip:
-- what they typed, their account, internet address and browser, and whether that try hit the limit (three every
-- ten minutes). Trip Control shows these beside the guests' history and the admin's access lines.
SET lock_timeout = '10s';

CREATE TABLE "TripLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TripLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripLog_kind_check" CHECK ("kind" IN ('email_refused'))
);
CREATE INDEX "TripLog_tripId_at_idx" ON "TripLog"("tripId", "at");
ALTER TABLE "TripLog" ADD CONSTRAINT "TripLog_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TripLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripLog" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
-- No insert, update or delete policy: only the function below writes, and nobody changes a line.

-- A refused join, written as the signed-in person who tried it (a guest is no member, so cannot write the table).
CREATE FUNCTION "log_refused_email"(trip_slug TEXT, typed_name TEXT, typed_email TEXT, typed_phone TEXT,
                                    ip TEXT, browser TEXT, hit_limit BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  INSERT INTO "TripLog" ("tripId", "kind", "actorUserId", "name", "email", "phone", "ipAddress", "userAgent", "blocked")
  SELECT "id", 'email_refused', "app_user_id"(), left(typed_name, 200), left(typed_email, 200), left(typed_phone, 50),
         left(ip, 64), left(browser, 500), hit_limit
    FROM "Trip" WHERE "slug" = trip_slug AND "published";
END $$;
REVOKE ALL ON FUNCTION "log_refused_email"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "log_refused_email"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO cc_app;
  END IF;
END $$;
