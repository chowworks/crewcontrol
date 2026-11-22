-- "Room to myself" (owner's decision, 2026-11-21): a room that sleeps 2 can offer a guest the whole room for an extra
-- price, and a guest who takes it keeps the room to themselves.
ALTER TABLE "Room" ADD COLUMN "wholeRoomExtraCents" INTEGER;
-- The room the guest has to themselves. It counts only while they are in that room (roomId), so moving them elsewhere
-- needs nothing cleared.
ALTER TABLE "Guest" ADD COLUMN "wholeRoomId" TEXT;

-- A guest's room must be on the guest's own trip and have a place left. A room someone has to themselves has none,
-- and taking a room to yourself needs it empty. Locks the room, so two guests can't both take its last place.
CREATE OR REPLACE FUNCTION "guest_room_fits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  room RECORD;
  taken INTEGER;
  whole BOOLEAN;
BEGIN
  IF NEW."roomId" IS NULL OR (TG_OP = 'UPDATE' AND NEW."roomId" IS NOT DISTINCT FROM OLD."roomId") THEN
    RETURN NEW;
  END IF;
  SELECT r."tripId", r."capacity", r."name" INTO room FROM "Room" r WHERE r."id" = NEW."roomId" FOR UPDATE;
  IF room IS NULL OR room."tripId" <> NEW."tripId" THEN
    RAISE EXCEPTION 'That room is not on this trip' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*), COALESCE(BOOL_OR(g."wholeRoomId" = g."roomId"), FALSE) INTO taken, whole
    FROM "Guest" g WHERE g."roomId" = NEW."roomId" AND g."id" <> NEW."id";
  IF whole OR taken >= room."capacity" OR (NEW."wholeRoomId" = NEW."roomId" AND taken > 0) THEN
    RAISE EXCEPTION 'room_full:%', room."name" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- How many places are taken in each room of a published trip, for "places left": a room someone has to themselves
-- is full. Never who.
CREATE OR REPLACE FUNCTION "public_room_taken"(trip_id TEXT)
RETURNS TABLE ("roomId" TEXT, "taken" INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."roomId",
         CASE WHEN BOOL_OR(g."wholeRoomId" = g."roomId") THEN MAX(r."capacity") ELSE COUNT(*) END::INTEGER
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId" JOIN "Room" r ON r."id" = g."roomId"
   WHERE g."tripId" = trip_id AND t."published" AND g."roomId" IS NOT NULL
   GROUP BY g."roomId"
$$;
