-- Sharing the floor plan with accepted guests (owner's decision, 2026-11-21): the organizer chooses it when they apply
-- rooms, and guests then see the plan as it was applied, never the draft. "shared" is that copy: the parts of the
-- house, the tiles, each room's name and beds, and which guest is on each place (no typed names, no Interested list,
-- no prices). Null while the plan isn't shared.
SET lock_timeout = '10s';

ALTER TABLE "RoomPlan" ADD COLUMN "shared" JSONB;
ALTER TABLE "RoomPlan" ADD COLUMN "sharedAt" TIMESTAMP(3);

-- The shared plan, for a signed-in guest who (or a traveler they look after) is accepted on the trip, with the names of
-- the trip's accepted guests to put on it. Nobody else gets a row: not a pending guest, not the public page.
CREATE FUNCTION "guest_room_plan"(trip_id TEXT)
RETURNS TABLE ("shared" JSONB, "sharedAt" TIMESTAMP(3), "accepted" JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."shared", p."sharedAt",
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', g."id", 'firstName', g."firstName", 'lastName', g."lastName")), '[]'::jsonb)
            FROM "Guest" g WHERE g."tripId" = trip_id AND g."status" = 'approved')
    FROM "RoomPlan" p
   WHERE p."tripId" = trip_id AND p."shared" IS NOT NULL
     AND "app_user_id"() IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Guest" me
                  WHERE me."tripId" = trip_id AND me."status" = 'approved'
                    AND (me."userId" = "app_user_id"() OR me."managedByUserId" = "app_user_id"()))
$$;
REVOKE ALL ON FUNCTION "guest_room_plan"(TEXT) FROM PUBLIC;

-- The restricted role may call it straight away (src/core/app-role-grants.ts lists it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "guest_room_plan"(TEXT) TO cc_app;
  END IF;
END $$;
