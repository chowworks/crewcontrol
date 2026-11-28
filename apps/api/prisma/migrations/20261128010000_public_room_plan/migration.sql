-- A shared floor plan on the public trip page (owner's decision, 2026-11-28): one share, shown two ways. Accepted guests
-- keep guest_room_plan, with names. Everyone else gets this: the parts of the house, the tiles, each room's name and
-- beds, and nothing about who is on which place (the copy's "spots" are left out), so every bed looks the same. Only
-- for a published trip that isn't deleted, while the plan is shared.
SET lock_timeout = '10s';

CREATE FUNCTION "public_room_plan"(trip_id TEXT)
RETURNS TABLE ("shared" JSONB, "sharedAt" TIMESTAMP(3))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."shared" - 'spots', p."sharedAt"
    FROM "RoomPlan" p
    JOIN "Trip" t ON t."id" = p."tripId"
   WHERE p."tripId" = trip_id AND p."shared" IS NOT NULL
     AND t."published" AND t."deletedAt" IS NULL
$$;
REVOKE ALL ON FUNCTION "public_room_plan"(TEXT) FROM PUBLIC;

-- The restricted role may call it straight away (src/core/app-role-grants.ts lists it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "public_room_plan"(TEXT) TO cc_app;
  END IF;
END $$;
