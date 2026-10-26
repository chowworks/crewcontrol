-- Fixes to the payment log from review (2026-10-26): a refund undone brings back only the payments that refund
-- covered; payments for one guest are counted one at a time; a guest can't report more than their price; and the
-- database's own update of a guest's spotPaidAt never trips the guest's self-limits.
SET lock_timeout = '10s';

-- Which refund a refunded payment went back with (the guest's refundSentAt at the time), so undoing that refund
-- counts only those payments again, never money refunded in an earlier round.
ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);
UPDATE "Payment" p SET "refundedAt" = g."refundSentAt"
  FROM "Guest" g WHERE g."id" = p."guestId" AND p."status" = 'refunded';

-- A guest reports a payment for their own row only, as reported, with the database's time; only once they may pay
-- (not turned down, and on an accept-first trip only once accepted); and never more than is left of their price.
-- Locks the guest, so two reports at once are checked one after the other.
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

-- The payment log's lines and the guest's spotPaidAt, as before, with the guest locked first so two confirmations at
-- once each count the other's; a payment counted again after a refund is undone pays the spot as of now, not as of
-- its first confirmation (first come order stays fair).
CREATE OR REPLACE FUNCTION "payment_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
  due INTEGER;
  total INTEGER;
BEGIN
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId" FOR UPDATE;
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
  ELSIF NEW."status" = 'confirmed' AND OLD."status" = 'confirmed'
        AND NEW."receivedPaymentAmount" IS DISTINCT FROM OLD."receivedPaymentAmount" THEN
    -- The organizer corrected what arrived.
    PERFORM "guest_event"(g, 'payment_confirmed', NULL, NULL, NULL, NULL, NEW."id", NEW."receivedPaymentAmount");
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
    UPDATE "Guest" SET "spotPaidAt" =
      CASE WHEN TG_OP = 'UPDATE' AND OLD."status" = 'refunded' THEN CURRENT_TIMESTAMP
           ELSE COALESCE(NEW."decidedAt", CURRENT_TIMESTAMP) END
     WHERE "id" = g."id";
  ELSIF (total < due OR total = 0) AND g."spotPaidAt" IS NOT NULL THEN
    UPDATE "Guest" SET "spotPaidAt" = NULL WHERE "id" = g."id";
  END IF;
  RETURN NULL;
END $$;

-- What a guest may change on their own row: their room wish until they are accepted. spotPaidAt belongs to
-- payment_logged (and the policies keep the guest from writing it), so its change never counts against the guest.
CREATE OR REPLACE FUNCTION "guest_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'roomId' - 'roomNote' - 'spotPaidAt')
     IS DISTINCT FROM (to_jsonb(OLD) - 'roomId' - 'roomNote' - 'spotPaidAt')
     OR (OLD."status" = 'approved'
         AND (NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."roomNote" IS DISTINCT FROM OLD."roomNote")) THEN
    RAISE EXCEPTION 'A guest can only change their room wish' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
