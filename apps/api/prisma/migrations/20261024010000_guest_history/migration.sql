-- A guest's history (owner's decision, 2026-10-24): each step of a guest's place on the trip (joining, signing,
-- payment, their spot, refunds, their room), as it happens, for the History section of the guest's details in Trip
-- Control. A contact detail change is logged by which details changed, never the old or new value. The database writes it from triggers, so a change made any way (the app,
-- the guest's own page, a script) is logged, and nobody can write, change or delete a line.
SET lock_timeout = '10s';

CREATE TABLE "GuestEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 'joined', 'signed', 'said_paid', 'payment_confirmed', 'payment_undone', 'accepted', 'turned_down',
    -- 'put_back', 'refund_sent', 'refund_undone', 'room_changed', 'contact_changed'
    "kind" TEXT NOT NULL,
    -- Who: the signed-in person's user id, or null for trusted work (the seed, a script).
    "actorUserId" TEXT,
    -- 'guest' (the guest themselves), 'organizer' (a member of the trip) or 'system'.
    "actor" TEXT NOT NULL,
    -- For room_changed: the room ids before and after.
    "fromRoomId" TEXT,
    "toRoomId" TEXT,
    -- For contact_changed: which details, comma separated ('name', 'email', 'phone').
    "fields" TEXT,
    -- Order within the same moment (confirming a payment on a first come trip also accepts the guest).
    "n" SERIAL NOT NULL,

    CONSTRAINT "GuestEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GuestEvent_actor_check" CHECK ("actor" IN ('guest', 'organizer', 'system'))
);
CREATE INDEX "GuestEvent_guestId_at_n_idx" ON "GuestEvent"("guestId", "at", "n");
CREATE INDEX "GuestEvent_tripId_idx" ON "GuestEvent"("tripId");
-- The line goes with its guest, and names its guest and trip together, so it never points at another trip's guest.
ALTER TABLE "GuestEvent" ADD CONSTRAINT "GuestEvent_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "GuestEvent" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
-- No insert, update or delete policy: the restricted role only reads; the triggers below write as the owner.

CREATE FUNCTION "guest_event"(g "Guest", kind TEXT, at TIMESTAMP(3), from_room TEXT, to_room TEXT,
                              fields TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  who TEXT := "app_user_id"();
BEGIN
  INSERT INTO "GuestEvent" ("tripId", "guestId", "at", "kind", "actorUserId", "actor", "fromRoomId", "toRoomId",
                            "fields")
  VALUES (g."tripId", g."id", COALESCE(at, CURRENT_TIMESTAMP), kind, who,
          -- An organizer who also joined their own trip acts as its organizer.
          CASE WHEN who IS NULL THEN 'system' WHEN g."tripId" = ANY ("app_trip_ids"()) THEN 'organizer'
               WHEN who = g."userId" THEN 'guest' ELSE 'organizer' END,
          from_room, to_room, fields);
END $$;
REVOKE ALL ON FUNCTION "guest_event"("Guest", TEXT, TIMESTAMP(3), TEXT, TEXT, TEXT) FROM PUBLIC;

-- A new guest: joining, and anything already true of them (the seed creates guests who have paid or been accepted).
-- A change: one line for each thing that changed.
CREATE FUNCTION "guest_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(NEW, 'joined', NEW."createdAt", NULL, NULL);
    IF NEW."paymentSentAt" IS NOT NULL THEN
      PERFORM "guest_event"(NEW, 'said_paid', NEW."paymentSentAt", NULL, NULL);
    END IF;
    IF NEW."paymentConfirmedAt" IS NOT NULL THEN
      PERFORM "guest_event"(NEW, 'payment_confirmed', NEW."paymentConfirmedAt", NULL, NULL);
    END IF;
    IF NEW."status" = 'approved' THEN
      -- Accepted before paying on an accept-first trip, after the payment arrived on the others.
      PERFORM "guest_event"(NEW, 'accepted',
        CASE WHEN (SELECT "joinMode" FROM "Trip" WHERE "id" = NEW."tripId") = 'accept_first' THEN NEW."createdAt"
             ELSE GREATEST(NEW."createdAt", NEW."paymentConfirmedAt") END, NULL, NULL);
    ELSIF NEW."status" = 'declined' THEN
      PERFORM "guest_event"(NEW, 'turned_down', NEW."createdAt", NULL, NULL);
    END IF;
    IF NEW."refundSentAt" IS NOT NULL THEN
      PERFORM "guest_event"(NEW, 'refund_sent', NEW."refundSentAt", NULL, NULL);
    END IF;
    RETURN NULL;
  END IF;
  -- Putting a turned-down guest back clears their payment and refund so they pay again: that is one step, not an
  -- undone payment and an undone refund (the refund was sent).
  IF OLD."status" = 'declined' AND NEW."status" = 'interested' THEN
    PERFORM "guest_event"(NEW, 'put_back', NULL, NULL, NULL);
    IF NEW."roomId" IS DISTINCT FROM OLD."roomId" THEN
      PERFORM "guest_event"(NEW, 'room_changed', NULL, OLD."roomId", NEW."roomId");
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."paymentSentAt" IS NOT NULL AND OLD."paymentSentAt" IS NULL THEN
    PERFORM "guest_event"(NEW, 'said_paid', NULL, NULL, NULL);
  END IF;
  IF NEW."paymentConfirmedAt" IS DISTINCT FROM OLD."paymentConfirmedAt" THEN
    PERFORM "guest_event"(NEW, CASE WHEN NEW."paymentConfirmedAt" IS NULL THEN 'payment_undone'
                                    ELSE 'payment_confirmed' END, NULL, NULL, NULL);
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
CREATE TRIGGER "Guest_9_logged" AFTER INSERT OR UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_logged"();
REVOKE ALL ON FUNCTION "guest_logged"() FROM PUBLIC;

-- Signing the trip agreement.
CREATE FUNCTION "signature_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
BEGIN
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId";
  PERFORM "guest_event"(g, 'signed', NEW."signedAt", NULL, NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER "AgreementSignature_9_logged" AFTER INSERT ON "AgreementSignature"
  FOR EACH ROW EXECUTE FUNCTION "signature_logged"();
REVOKE ALL ON FUNCTION "signature_logged"() FROM PUBLIC;

-- Guests who joined before this: their history so far, from what their row and signature already record.
INSERT INTO "GuestEvent" ("tripId", "guestId", "at", "kind", "actor")
SELECT "tripId", "id", "createdAt", 'joined', 'system' FROM "Guest"
UNION ALL
SELECT "tripId", "guestId", "signedAt", 'signed', 'system' FROM "AgreementSignature"
UNION ALL
SELECT "tripId", "id", "paymentSentAt", 'said_paid', 'system' FROM "Guest" WHERE "paymentSentAt" IS NOT NULL
UNION ALL
SELECT "tripId", "id", "paymentConfirmedAt", 'payment_confirmed', 'system' FROM "Guest"
 WHERE "paymentConfirmedAt" IS NOT NULL
UNION ALL
SELECT "tripId", "id", "refundSentAt", 'refund_sent', 'system' FROM "Guest" WHERE "refundSentAt" IS NOT NULL
ORDER BY 3;
