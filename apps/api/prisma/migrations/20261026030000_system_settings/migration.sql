-- System settings (owner's decision, 2026-10-26): CrewControl-wide values the platform admin sets in the Admin
-- toolbox ("System Settings"), one row. The first is the waitlist buffer: on the trips where guests pay before they're
-- accepted, joining goes to the waitlist once the guests who can see how to pay fill the spots left plus this share.
SET lock_timeout = '10s';

CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    -- Percent of the spots left, rounded up; 0 waitlists as soon as those who can pay fill the spots exactly.
    "waitlistBufferPercent" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SystemSettings_one_row" CHECK ("id" = 1),
    CONSTRAINT "SystemSettings_waitlistBufferPercent_check"
      CHECK ("waitlistBufferPercent" BETWEEN 0 AND 100)
);
INSERT INTO "SystemSettings" ("id") VALUES (1);

-- Everyone reads them (they shape what every trip does); only the admin changes them, and nobody adds or removes the
-- row. Not trip data, but listed with the tables that carry policies (src/core/tenant-tables.ts) so the admin's mark is set when it writes.
ALTER TABLE "SystemSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "SystemSettings" FOR SELECT USING (true);
CREATE POLICY "tenant_update" ON "SystemSettings" FOR UPDATE
  USING ((SELECT "app_is_admin"())) WITH CHECK ((SELECT "app_is_admin"()));

-- The waitlist reads its buffer from the settings.
CREATE OR REPLACE FUNCTION "trip_waitlisting"(trip_id TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t "Trip";
  spots_left INTEGER;
  in_line INTEGER;
  buffer INTEGER;
BEGIN
  SELECT * INTO t FROM "Trip" WHERE "id" = trip_id;
  IF t."maxGuests" IS NULL THEN RETURN false; END IF;
  SELECT t."maxGuests" - COUNT(*) INTO spots_left FROM "Guest" WHERE "tripId" = trip_id AND "status" = 'approved';
  IF spots_left <= 0 THEN RETURN true; END IF;
  IF t."joinMode" = 'accept_first' THEN RETURN false; END IF;
  SELECT COALESCE((SELECT "waitlistBufferPercent" FROM "SystemSettings" WHERE "id" = 1), 10) INTO buffer;
  SELECT COUNT(*) INTO in_line FROM "Guest"
   WHERE "tripId" = trip_id AND "status" = 'interested' AND "refundSentAt" IS NULL
     AND ("waitlistedAt" IS NULL OR "offeredAt" IS NOT NULL);
  RETURN in_line >= spots_left + CEIL(spots_left * buffer / 100.0)::INTEGER;
END $$;
