-- The waitlist (owner's decision, 2026-10-24): a full trip keeps taking sign-ups. A guest who joins once the trip is
-- full waits in line, sees no way to pay, and moves up only when an organizer offers them a spot that opened. On the
-- trips where guests pay before they're accepted, "full" comes early: once the guests who can already see how to pay
-- (joined, waiting, not on the waitlist) fill the spots left plus 10%, rounded up, newcomers wait. That keeps the
-- money sent for spots that don't exist small, because "I've paid" is a guest's word, not a booking.
SET lock_timeout = '10s';

-- When a guest joined onto the waitlist, and when an organizer offered them a spot (they may pay from then on; on an
-- accept-first trip the offer is the acceptance itself, so this stays empty there).
ALTER TABLE "Guest" ADD COLUMN "waitlistedAt" TIMESTAMP(3);
ALTER TABLE "Guest" ADD COLUMN "offeredAt" TIMESTAMP(3);

-- Whether someone joining the trip now goes on the waitlist. Runs as the owner to count every guest.
CREATE FUNCTION "trip_waitlisting"(trip_id TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t "Trip";
  spots_left INTEGER;
  in_line INTEGER;
BEGIN
  SELECT * INTO t FROM "Trip" WHERE "id" = trip_id;
  IF t."maxGuests" IS NULL THEN RETURN false; END IF;
  SELECT t."maxGuests" - COUNT(*) INTO spots_left FROM "Guest" WHERE "tripId" = trip_id AND "status" = 'approved';
  IF spots_left <= 0 THEN RETURN true; END IF;
  IF t."joinMode" = 'accept_first' THEN RETURN false; END IF;
  SELECT COUNT(*) INTO in_line FROM "Guest"
   WHERE "tripId" = trip_id AND "status" = 'interested' AND "refundSentAt" IS NULL
     AND ("waitlistedAt" IS NULL OR "offeredAt" IS NOT NULL);
  RETURN in_line >= spots_left + CEIL(spots_left * 0.1)::INTEGER;
END $$;
REVOKE ALL ON FUNCTION "trip_waitlisting"(TEXT) FROM PUBLIC;

-- The same, for a published trip's public pages and the join page (a count of nobody, only yes or no).
CREATE FUNCTION "public_trip_waitlisting"(trip_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN "trip_is_published"(trip_id) THEN "trip_waitlisting"(trip_id) ELSE false END
$$;
REVOKE ALL ON FUNCTION "public_trip_waitlisting"(TEXT) FROM PUBLIC;

-- A guest joining as themselves goes on the waitlist when the trip says so, and is never offered a spot by joining.
-- The trip is locked so two people joining at once are counted one after the other. Organizers and trusted work (the
-- seed) set these as they write them.
CREATE FUNCTION "guest_waitlist"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "Trip" WHERE "id" = NEW."tripId" FOR UPDATE;
  NEW."waitlistedAt" := CASE WHEN "trip_waitlisting"(NEW."tripId") THEN CURRENT_TIMESTAMP END;
  NEW."offeredAt" := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_1_waitlist" BEFORE INSERT ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_waitlist"();
REVOKE ALL ON FUNCTION "guest_waitlist"() FROM PUBLIC;

-- A guest on the waitlist pays only once offered a spot.
CREATE OR REPLACE FUNCTION "payment_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
  price INTEGER;
  counted INTEGER;
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId" FOR UPDATE;
  IF g."status" = 'declined' OR g."refundSentAt" IS NOT NULL
     OR (g."waitlistedAt" IS NOT NULL AND g."offeredAt" IS NULL AND g."status" <> 'approved')
     OR (g."status" <> 'approved' AND (SELECT "joinMode" FROM "Trip" WHERE "id" = NEW."tripId") = 'accept_first') THEN
    RAISE EXCEPTION 'This guest can''t pay yet' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(s."priceCents", t."costPerPersonCents") INTO price
    FROM "Trip" t LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id"
   WHERE t."id" = g."tripId";
  SELECT COALESCE(SUM(CASE WHEN "status" = 'confirmed' THEN "receivedPaymentAmount" ELSE "guestPaymentAmount" END), 0)
    INTO counted
    FROM "Payment" WHERE "guestId" = g."id" AND "status" IN ('reported', 'confirmed');
  IF counted + NEW."guestPaymentAmount" > price THEN
    RAISE EXCEPTION 'more_than_left' USING ERRCODE = '23514';
  END IF;
  NEW."reportedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

-- History: joining onto the waitlist, and being offered a spot.
CREATE OR REPLACE FUNCTION "guest_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(NEW, 'joined', NEW."createdAt", NULL, NULL);
    IF NEW."waitlistedAt" IS NOT NULL THEN
      PERFORM "guest_event"(NEW, 'waitlisted', NEW."waitlistedAt", NULL, NULL);
    END IF;
    IF NEW."status" = 'approved' THEN
      PERFORM "guest_event"(NEW, 'accepted', NEW."createdAt", NULL, NULL);
    ELSIF NEW."status" = 'declined' THEN
      PERFORM "guest_event"(NEW, 'turned_down', NEW."createdAt", NULL, NULL);
    END IF;
    IF NEW."refundSentAt" IS NOT NULL THEN
      PERFORM "guest_event"(NEW, 'refund_sent', NEW."refundSentAt", NULL, NULL);
    END IF;
    RETURN NULL;
  END IF;
  -- Putting a turned-down guest back clears their refund so they pay again: that is one step, not an undone refund
  -- (the refund was sent).
  IF OLD."status" = 'declined' AND NEW."status" = 'interested' THEN
    PERFORM "guest_event"(NEW, 'put_back', NULL, NULL, NULL);
    IF NEW."roomId" IS DISTINCT FROM OLD."roomId" THEN
      PERFORM "guest_event"(NEW, 'room_changed', NULL, OLD."roomId", NEW."roomId");
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."offeredAt" IS NOT NULL AND OLD."offeredAt" IS NULL THEN
    PERFORM "guest_event"(NEW, 'offered', NEW."offeredAt", NULL, NULL);
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "guest_event"(NEW, CASE NEW."status" WHEN 'approved' THEN 'accepted'
                                                 WHEN 'declined' THEN 'turned_down'
                                                 ELSE 'put_back' END, NULL, NULL, NULL);
  END IF;
  IF NEW."refundSentAt" IS DISTINCT FROM OLD."refundSentAt" THEN
    PERFORM "guest_event"(NEW, CASE WHEN NEW."refundSentAt" IS NULL THEN 'refund_undone'
                                    ELSE 'refund_sent' END, NULL, NULL, NULL);
  END IF;
  IF NEW."roomId" IS DISTINCT FROM OLD."roomId" THEN
    PERFORM "guest_event"(NEW, 'room_changed', NULL, OLD."roomId", NEW."roomId");
  END IF;
  IF ROW(NEW."firstName", NEW."lastName", NEW."email", NEW."phone")
     IS DISTINCT FROM ROW(OLD."firstName", OLD."lastName", OLD."email", OLD."phone") THEN
    PERFORM "guest_event"(NEW, 'contact_changed', NULL, NULL, NULL, array_to_string(ARRAY[
      CASE WHEN ROW(NEW."firstName", NEW."lastName") IS DISTINCT FROM ROW(OLD."firstName", OLD."lastName")
           THEN 'name' END,
      CASE WHEN NEW."email" IS DISTINCT FROM OLD."email" THEN 'email' END,
      CASE WHEN NEW."phone" IS DISTINCT FROM OLD."phone" THEN 'phone' END], ','));
  END IF;
  RETURN NULL;
END $$;


-- The restricted role may ask whether a trip is waitlisting straight away (src/core/app-role-grants.ts lists it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "public_trip_waitlisting"(TEXT) TO cc_app;
  END IF;
END $$;
