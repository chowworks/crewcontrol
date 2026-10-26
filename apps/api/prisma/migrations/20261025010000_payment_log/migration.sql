-- The payment log (owner's decision, 2026-10-24): one row per payment a guest sends the organizer, for any installment,
-- in place of the guest's two timestamps ("said they paid", "confirmed"). The guest reports what they sent, how and
-- when (with a note when it is less than was due); the organizer confirms what arrived, or says it didn't. No payment
-- is special: a guest's spot counts as paid once the payments confirmed add up to the first payment their agreement
-- asked for, and the database keeps that moment on the guest (spotPaidAt). Trips list how guests can pay them.
SET lock_timeout = '10s';

-- ── How guests can pay ───────────────────────────────────────────────────────
-- PaymentMethod[]: a fixed kind with its handle (Cash App, Zelle, Venmo, PayPal, Apple Cash) or a free-form one
-- ("Pay in person"). paymentInstructions stays as a note for anything else.
ALTER TABLE "Trip" ADD COLUMN "paymentMethods" JSONB NOT NULL DEFAULT '[]';

-- ── Payments ─────────────────────────────────────────────────────────────────
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    -- Whole cents. What the guest says they sent; never changed.
    "guestPaymentAmount" INTEGER NOT NULL,
    -- Whole cents. What the organizer says arrived, set when they confirm it.
    "receivedPaymentAmount" INTEGER,
    -- How it was paid, as the guest picked it ("Zelle · (555) 010-0199"), and its kind.
    "method" TEXT NOT NULL,
    "methodKind" TEXT NOT NULL,
    -- 'YYYY-MM-DD': the day the guest says they sent it.
    "sentOn" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    -- 'reported' (waiting for the organizer), 'confirmed', 'not_received', or 'refunded' (the organizer turned the
    -- guest down and sent it back).
    "status" TEXT NOT NULL DEFAULT 'reported',
    -- 'guest', or 'organizer' for a payment handed over in person and logged by the organizer.
    "loggedBy" TEXT NOT NULL DEFAULT 'guest',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_status_check" CHECK ("status" IN ('reported', 'confirmed', 'not_received', 'refunded')),
    CONSTRAINT "Payment_loggedBy_check" CHECK ("loggedBy" IN ('guest', 'organizer')),
    CONSTRAINT "Payment_methodKind_check"
      CHECK ("methodKind" IN ('cashapp', 'zelle', 'venmo', 'paypal', 'applecash', 'custom', 'other')),
    CONSTRAINT "Payment_amounts_check"
      CHECK ("guestPaymentAmount" > 0 AND ("receivedPaymentAmount" IS NULL OR "receivedPaymentAmount" >= 0)),
    -- Confirmed and refunded payments say what arrived.
    CONSTRAINT "Payment_received_check"
      CHECK ("status" NOT IN ('confirmed', 'refunded') OR "receivedPaymentAmount" IS NOT NULL)
);
CREATE INDEX "Payment_tripId_idx" ON "Payment"("tripId");
CREATE INDEX "Payment_guestId_reportedAt_idx" ON "Payment"("guestId", "reportedAt");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A payment names its guest and trip together, so it never points at another trip's guest.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "Payment_3_keep" BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'guestId');

-- ── Payments so far ──────────────────────────────────────────────────────────
-- Each guest who said they paid, or whose payment was confirmed, gets one payment: the first payment their agreement
-- asked for (the trip's, for guests who joined before signing existed), method not recorded.
INSERT INTO "Payment" ("id", "tripId", "guestId", "guestPaymentAmount", "receivedPaymentAmount", "method",
                       "methodKind", "sentOn", "status", "loggedBy", "reportedAt", "decidedAt")
SELECT 'pay_' || g."id", g."tripId", g."id", first."cents",
       CASE WHEN g."paymentConfirmedAt" IS NOT NULL THEN first."cents" END,
       'Not recorded', 'other',
       to_char(COALESCE(g."paymentSentAt", g."paymentConfirmedAt"), 'YYYY-MM-DD'),
       CASE WHEN g."paymentConfirmedAt" IS NULL THEN 'reported'
            WHEN g."refundSentAt" IS NOT NULL THEN 'refunded' ELSE 'confirmed' END,
       'guest', COALESCE(g."paymentSentAt", g."paymentConfirmedAt"), g."paymentConfirmedAt"
  FROM "Guest" g
  JOIN "Trip" t ON t."id" = g."tripId"
  LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id"
 CROSS JOIN LATERAL (
   SELECT CASE WHEN COALESCE(s."installmentCount", t."installmentCount") <= 1
               THEN COALESCE(s."priceCents", t."costPerPersonCents")
               ELSE COALESCE(s."priceCents", t."costPerPersonCents")
                    / COALESCE(s."installmentCount", t."installmentCount") END AS "cents"
 ) first
 WHERE (g."paymentSentAt" IS NOT NULL OR g."paymentConfirmedAt" IS NOT NULL) AND first."cents" > 0;

-- ── The guest row ────────────────────────────────────────────────────────────
-- The policies name the old columns, so they go first and come back without them.
DROP POLICY "tenant_insert" ON "Guest";
DROP POLICY "tenant_update" ON "Guest";
ALTER TABLE "Guest" DROP COLUMN "paymentSentAt";
-- Kept from the payments from now on (payment_logged, below).
ALTER TABLE "Guest" RENAME COLUMN "paymentConfirmedAt" TO "spotPaidAt";

-- A signed-in person may join a published trip as themselves, read their own row, and change it (their room wish)
-- only while waiting or accepted, with their spot not yet paid and no refund.
CREATE POLICY "tenant_insert" ON "Guest" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("userId" = (SELECT "app_user_id"()) AND "status" = 'interested'
                  AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL
                  AND "trip_is_published"("tripId")));
CREATE POLICY "tenant_update" ON "Guest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR ("userId" = (SELECT "app_user_id"()) AND "status" IN ('interested', 'approved')
             AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("userId" = (SELECT "app_user_id"()) AND "status" IN ('interested', 'approved')
                  AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL));

-- What a guest may change on their own row: their room wish until they are accepted. Paying is a Payment now.
CREATE OR REPLACE FUNCTION "guest_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'roomId' - 'roomNote') IS DISTINCT FROM (to_jsonb(OLD) - 'roomId' - 'roomNote')
     OR (OLD."status" = 'approved'
         AND (NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."roomNote" IS DISTINCT FROM OLD."roomNote")) THEN
    RAISE EXCEPTION 'A guest can only change their room wish' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ── History ──────────────────────────────────────────────────────────────────
-- Payment lines name their payment and amount.
ALTER TABLE "GuestEvent" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "GuestEvent" ADD COLUMN "amount" INTEGER;

DROP FUNCTION "guest_event"("Guest", TEXT, TIMESTAMP(3), TEXT, TEXT, TEXT);
CREATE FUNCTION "guest_event"(g "Guest", kind TEXT, at TIMESTAMP(3), from_room TEXT, to_room TEXT,
                              fields TEXT DEFAULT NULL, payment_id TEXT DEFAULT NULL,
                              amount INTEGER DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  who TEXT := "app_user_id"();
BEGIN
  INSERT INTO "GuestEvent" ("tripId", "guestId", "at", "kind", "actorUserId", "actor", "fromRoomId", "toRoomId",
                            "fields", "paymentId", "amount")
  VALUES (g."tripId", g."id", COALESCE(at, CURRENT_TIMESTAMP), kind, who,
          -- An organizer who also joined their own trip acts as its organizer.
          CASE WHEN who IS NULL THEN 'system' WHEN g."tripId" = ANY ("app_trip_ids"()) THEN 'organizer'
               WHEN who = g."userId" THEN 'guest' ELSE 'organizer' END,
          from_room, to_room, fields, payment_id, amount);
END $$;
REVOKE ALL ON FUNCTION "guest_event"("Guest", TEXT, TIMESTAMP(3), TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;

-- The guest's own steps. Payments log themselves (payment_logged, below).
CREATE OR REPLACE FUNCTION "guest_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(NEW, 'joined', NEW."createdAt", NULL, NULL);
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

-- A refunded guest's spot is no longer paid. (After guest_logged stops reading the dropped column.)
UPDATE "Guest" SET "spotPaidAt" = NULL WHERE "refundSentAt" IS NOT NULL;

-- ── What a guest may do with payments ────────────────────────────────────────
-- A guest reports a payment for their own row only, as reported, with the database's time; and only once they may
-- pay: not turned down, and on an accept-first trip only once accepted (they haven't seen how to pay before then).
-- The organizer decides it; nobody deletes one.
CREATE FUNCTION "payment_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId";
  IF g."status" = 'declined' OR g."refundSentAt" IS NOT NULL
     OR (g."status" <> 'approved' AND (SELECT "joinMode" FROM "Trip" WHERE "id" = NEW."tripId") = 'accept_first') THEN
    RAISE EXCEPTION 'This guest can''t pay yet' USING ERRCODE = '42501';
  END IF;
  NEW."reportedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_4_self_limits" BEFORE INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "payment_self_limits"();
REVOKE ALL ON FUNCTION "payment_self_limits"() FROM PUBLIC;

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "Payment" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "Payment" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]) AND "status" = 'reported'
                  AND "loggedBy" = 'guest' AND "receivedPaymentAmount" IS NULL AND "decidedAt" IS NULL
                  AND "decidedByUserId" IS NULL));
CREATE POLICY "tenant_update" ON "Payment" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- ── A payment's history, and the spot it pays for ────────────────────────────
-- One line per step: reported, confirmed (with what arrived), not received, or undone. A refund is the guest's own
-- line (refund_sent), so a payment refunded with it adds none. Then the guest's spotPaidAt follows the total confirmed:
-- set when it first reaches the first payment their agreement asked for, cleared if it drops below.
CREATE FUNCTION "payment_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
  due INTEGER;
  total INTEGER;
BEGIN
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId";
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(g, 'said_paid', NEW."reportedAt", NULL, NULL, NULL, NEW."id", NEW."guestPaymentAmount");
    IF NEW."status" = 'confirmed' THEN
      PERFORM "guest_event"(g, 'payment_confirmed', COALESCE(NEW."decidedAt", NEW."reportedAt"), NULL, NULL, NULL,
                            NEW."id", NEW."receivedPaymentAmount");
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" AND NEW."status" <> 'refunded' AND OLD."status" <> 'refunded' THEN
    PERFORM "guest_event"(g, CASE NEW."status" WHEN 'confirmed' THEN 'payment_confirmed'
                                               WHEN 'not_received' THEN 'payment_not_received'
                                               ELSE 'payment_undone' END,
                          NULL, NULL, NULL, NULL, NEW."id",
                          CASE WHEN NEW."status" = 'confirmed' THEN NEW."receivedPaymentAmount" END);
  END IF;

  SELECT CASE WHEN COALESCE(s."installmentCount", t."installmentCount") <= 1
              THEN COALESCE(s."priceCents", t."costPerPersonCents")
              ELSE COALESCE(s."priceCents", t."costPerPersonCents")
                   / COALESCE(s."installmentCount", t."installmentCount") END
    INTO due
    FROM "Trip" t LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id"
   WHERE t."id" = g."tripId";
  SELECT COALESCE(SUM("receivedPaymentAmount"), 0) INTO total
    FROM "Payment" WHERE "guestId" = g."id" AND "status" = 'confirmed';
  IF total >= due AND total > 0 AND g."spotPaidAt" IS NULL THEN
    UPDATE "Guest" SET "spotPaidAt" = COALESCE(NEW."decidedAt", CURRENT_TIMESTAMP) WHERE "id" = g."id";
  ELSIF (total < due OR total = 0) AND g."spotPaidAt" IS NOT NULL THEN
    UPDATE "Guest" SET "spotPaidAt" = NULL WHERE "id" = g."id";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "Payment_9_logged" AFTER INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "payment_logged"();
REVOKE ALL ON FUNCTION "payment_logged"() FROM PUBLIC;
