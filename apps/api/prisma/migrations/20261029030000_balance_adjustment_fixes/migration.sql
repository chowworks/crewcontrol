-- Balance adjustments, after review (issue #17): the payment that holds a spot counts the organizer's credits and
-- charges, the database checks a credit against what was paid with the guest's row locked, and each adjustment names
-- its own caller as who added or removed it.
SET lock_timeout = '10s';

-- A credit (or taking a charge off) never leaves less to pay than was confirmed or is waiting to be. The guest's row is
-- locked first, as payment_self_limits locks it, so a credit and a payment report at the same moment each see the other.
CREATE FUNCTION "adjustment_fits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
  price INTEGER;
  counted INTEGER;
BEGIN
  -- Someone not on the trip is refused by the policies; nothing to lock for them.
  IF "app_user_id"() IS NOT NULL AND NOT (NEW."tripId" = ANY ("app_trip_ids"())) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId" FOR UPDATE;
  SELECT COALESCE(s."priceCents", t."costPerPersonCents") INTO price
    FROM "Trip" t LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id"
   WHERE t."id" = g."tripId";
  price := price + COALESCE((SELECT SUM(CASE WHEN "kind" = 'charge' THEN "amountCents" ELSE -"amountCents" END)
                               FROM "BalanceAdjustment"
                              WHERE "guestId" = g."id" AND "removedAt" IS NULL AND "id" <> NEW."id"), 0)
                 + CASE WHEN NEW."removedAt" IS NOT NULL THEN 0
                        WHEN NEW."kind" = 'charge' THEN NEW."amountCents" ELSE -NEW."amountCents" END;
  SELECT COALESCE(SUM(CASE WHEN "status" = 'confirmed' THEN "receivedPaymentAmount" ELSE "guestPaymentAmount" END), 0)
    INTO counted
    FROM "Payment" WHERE "guestId" = g."id" AND "status" IN ('reported', 'confirmed');
  IF counted > price THEN
    RAISE EXCEPTION 'more_than_left' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BalanceAdjustment_5_fits" BEFORE INSERT OR UPDATE ON "BalanceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "adjustment_fits"();
REVOKE ALL ON FUNCTION "adjustment_fits"() FROM PUBLIC;

-- Each names its own caller as who added or removed it.
DROP POLICY "tenant_insert" ON "BalanceAdjustment";
DROP POLICY "tenant_update" ON "BalanceAdjustment";
CREATE POLICY "tenant_insert" ON "BalanceAdjustment" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "removedAt" IS NULL
              AND "createdByUserId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "BalanceAdjustment" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "removedByUserId" = (SELECT "app_user_id"()));

-- ── The payment that holds a spot ────────────────────────────────────────────
-- The first installment, as before, but never more than the guest owes in all once adjustments count: a credit that
-- leaves less than the first installment to pay means paying everything left holds the spot.
CREATE FUNCTION "spot_due"(g "Guest") RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  price INTEGER;
  first INTEGER;
BEGIN
  SELECT COALESCE(s."priceCents", t."costPerPersonCents"),
         CASE WHEN COALESCE(s."installmentCount", t."installmentCount") <= 1
              THEN COALESCE(s."priceCents", t."costPerPersonCents")
              ELSE COALESCE(s."priceCents", t."costPerPersonCents")
                   / COALESCE(s."installmentCount", t."installmentCount") END
    INTO price, first
    FROM "Trip" t LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id"
   WHERE t."id" = g."tripId";
  RETURN LEAST(first, price + COALESCE((SELECT SUM(CASE WHEN "kind" = 'charge' THEN "amountCents" ELSE -"amountCents" END)
                                          FROM "BalanceAdjustment"
                                         WHERE "guestId" = g."id" AND "removedAt" IS NULL), 0));
END $$;
REVOKE ALL ON FUNCTION "spot_due"("Guest") FROM PUBLIC;

-- As the payment log fixes left it, with the spot's payment from spot_due.
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

  due := "spot_due"(g);
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

-- credit_added, charge_added, credit_removed, charge_removed. An adjustment can change the spot's payment, so the
-- spot is paid (as of now) or no longer paid as payment_logged would decide it.
CREATE OR REPLACE FUNCTION "adjustment_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
  due INTEGER;
  total INTEGER;
BEGIN
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId" FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(g, NEW."kind" || '_added', NEW."createdAt", NULL, NULL, NULL, NULL, NEW."amountCents",
                          NEW."id");
  ELSIF NEW."removedAt" IS NOT NULL AND OLD."removedAt" IS NULL THEN
    PERFORM "guest_event"(g, NEW."kind" || '_removed', NEW."removedAt", NULL, NULL, NULL, NULL, NEW."amountCents",
                          NEW."id");
  END IF;
  due := "spot_due"(g);
  SELECT COALESCE(SUM("receivedPaymentAmount"), 0) INTO total
    FROM "Payment" WHERE "guestId" = g."id" AND "status" = 'confirmed';
  IF total >= due AND total > 0 AND g."spotPaidAt" IS NULL THEN
    UPDATE "Guest" SET "spotPaidAt" = CURRENT_TIMESTAMP WHERE "id" = g."id";
  ELSIF (total < due OR total = 0) AND g."spotPaidAt" IS NOT NULL THEN
    UPDATE "Guest" SET "spotPaidAt" = NULL WHERE "id" = g."id";
  END IF;
  RETURN NULL;
END $$;
