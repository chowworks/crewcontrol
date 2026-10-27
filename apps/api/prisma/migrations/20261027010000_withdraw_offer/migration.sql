-- Withdrawing an offer (owner's decision, 2026-10-27): the organizer takes back a spot offered from the waitlist and
-- the guest waits again (offeredAt back to NULL). The history logs it as offer_withdrawn; the rest of guest_logged is
-- as the waitlist migration left it.
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
  ELSIF NEW."offeredAt" IS NULL AND OLD."offeredAt" IS NOT NULL THEN
    PERFORM "guest_event"(NEW, 'offer_withdrawn', NULL, NULL, NULL);
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
