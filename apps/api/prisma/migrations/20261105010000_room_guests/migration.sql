-- Who's in each room of a published trip, for the room picker on the join page: accepted guests' names only, never
-- anyone not yet accepted. Only the signed-in join page asks (JoinService); the public trip page never does, so a
-- trip that hides "Who's going" keeps names off its public page while guests picking a room still see who's in it.
CREATE FUNCTION "public_room_guests"(trip_id TEXT)
RETURNS TABLE ("roomId" TEXT, "firstName" TEXT, "lastName" TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."roomId", g."firstName", g."lastName"
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
   WHERE g."tripId" = trip_id AND t."published" AND g."status" = 'approved' AND g."roomId" IS NOT NULL
   ORDER BY g."createdAt"
$$;
REVOKE ALL ON FUNCTION "public_room_guests"(TEXT) FROM PUBLIC;

-- The restricted role may call it straight away (src/core/app-role-grants.ts lists it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "public_room_guests"(TEXT) TO cc_app;
  END IF;
END $$;
