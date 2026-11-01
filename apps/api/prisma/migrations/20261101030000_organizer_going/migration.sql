-- An organizer going on their own trip (issue #53): "I'm going too" on Trip Control makes them an accepted guest at
-- once, taking a spot, with no trip agreement (they accepted the Organizer Terms). Only the trip's members write it:
-- the Guest policies and guest_self_limits already keep a guest from changing it on their own row.
ALTER TABLE "Guest" ADD COLUMN "organizerGoingAt" TIMESTAMP(3);

-- Only the trip's members mark a guest as an organizer going: a guest joining or changing their own row never can, so
-- nobody joins at $0 by setting it.
CREATE FUNCTION "guest_organizer_going"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW."organizerGoingAt" IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW."organizerGoingAt" IS DISTINCT FROM OLD."organizerGoingAt") THEN
    RAISE EXCEPTION 'Only the trip''s organizers say an organizer is going' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_8_organizer_going" BEFORE INSERT OR UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_organizer_going"();
REVOKE ALL ON FUNCTION "guest_organizer_going"() FROM PUBLIC;
