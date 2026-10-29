-- Balance adjustments (issue #17, owner's decision 2026-10-28): the organizer corrects a guest's books by hand once
-- they've agreed outside the app, with a credit ("$50 off for driving the van") or a charge ("$40 for the extra
-- night"), and a reason. Not a payment: recorded only, Travel HQ never moves money. The signed agreement's price stays
-- as signed; an adjustment sits beside it, and the guest's balance is the price, plus charges, less credits, less what
-- arrived. An adjustment is never edited: the organizer removes it (kept, marked removed) and adds another. Each one
-- is a line in the guest's history.
SET lock_timeout = '10s';

CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    -- 'credit' lowers the balance, 'charge' raises it.
    "kind" TEXT NOT NULL,
    -- Whole cents.
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    -- When an organizer took it back; it no longer counts.
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BalanceAdjustment_kind_check" CHECK ("kind" IN ('credit', 'charge')),
    CONSTRAINT "BalanceAdjustment_amount_check" CHECK ("amountCents" > 0),
    CONSTRAINT "BalanceAdjustment_reason_check" CHECK (length(trim("reason")) > 0)
);
CREATE INDEX "BalanceAdjustment_tripId_idx" ON "BalanceAdjustment"("tripId");
CREATE INDEX "BalanceAdjustment_guestId_idx" ON "BalanceAdjustment"("guestId");
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- An adjustment names its guest and trip together, so it never points at another trip's guest.
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "BalanceAdjustment_3_keep" BEFORE UPDATE ON "BalanceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'guestId');

-- Never edited silently: the only change is removing it, once.
CREATE FUNCTION "adjustment_only_removed"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NULL
     OR (to_jsonb(NEW) - 'removedAt' - 'removedByUserId')
        IS DISTINCT FROM (to_jsonb(OLD) - 'removedAt' - 'removedByUserId') THEN
    RAISE EXCEPTION 'An adjustment can only be removed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BalanceAdjustment_4_only_removed" BEFORE UPDATE ON "BalanceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "adjustment_only_removed"();
REVOKE ALL ON FUNCTION "adjustment_only_removed"() FROM PUBLIC;

-- The trip's members read, add and remove its adjustments; a guest (and whoever looks after them) reads their own;
-- the admin reads them, as it reads payments. Nobody deletes one.
ALTER TABLE "BalanceAdjustment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "BalanceAdjustment" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "BalanceAdjustment" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "BalanceAdjustment" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "removedAt" IS NULL);
CREATE POLICY "tenant_update" ON "BalanceAdjustment" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- ── History ──────────────────────────────────────────────────────────────────
-- Adjustment lines name their adjustment (for its reason) and amount.
ALTER TABLE "GuestEvent" ADD COLUMN "adjustmentId" TEXT;

DROP FUNCTION "guest_event"("Guest", TEXT, TIMESTAMP(3), TEXT, TEXT, TEXT, TEXT, INTEGER);
CREATE FUNCTION "guest_event"(g "Guest", kind TEXT, at TIMESTAMP(3), from_room TEXT, to_room TEXT,
                              fields TEXT DEFAULT NULL, payment_id TEXT DEFAULT NULL,
                              amount INTEGER DEFAULT NULL, adjustment_id TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  who TEXT := "app_user_id"();
BEGIN
  INSERT INTO "GuestEvent" ("tripId", "guestId", "at", "kind", "actorUserId", "actor", "fromRoomId", "toRoomId",
                            "fields", "paymentId", "amount", "adjustmentId")
  VALUES (g."tripId", g."id", COALESCE(at, CURRENT_TIMESTAMP), kind, who,
          -- An organizer who also joined their own trip acts as its organizer.
          CASE WHEN who IS NULL THEN 'system' WHEN g."tripId" = ANY ("app_trip_ids"()) THEN 'organizer'
               WHEN who = g."userId" OR who = g."managedByUserId" THEN 'guest' ELSE 'organizer' END,
          from_room, to_room, fields, payment_id, amount, adjustment_id);
END $$;
REVOKE ALL ON FUNCTION "guest_event"("Guest", TEXT, TIMESTAMP(3), TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;

-- credit_added, charge_added, credit_removed, charge_removed.
CREATE FUNCTION "adjustment_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g "Guest";
BEGIN
  SELECT * INTO g FROM "Guest" WHERE "id" = NEW."guestId";
  IF TG_OP = 'INSERT' THEN
    PERFORM "guest_event"(g, NEW."kind" || '_added', NEW."createdAt", NULL, NULL, NULL, NULL, NEW."amountCents",
                          NEW."id");
  ELSIF NEW."removedAt" IS NOT NULL AND OLD."removedAt" IS NULL THEN
    PERFORM "guest_event"(g, NEW."kind" || '_removed', NEW."removedAt", NULL, NULL, NULL, NULL, NEW."amountCents",
                          NEW."id");
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "BalanceAdjustment_9_logged" AFTER INSERT OR UPDATE ON "BalanceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "adjustment_logged"();
REVOKE ALL ON FUNCTION "adjustment_logged"() FROM PUBLIC;

-- ── What a guest may report ──────────────────────────────────────────────────
-- As before (the waitlist's version), with what's left counting the guest's adjustments: never more than the price,
-- plus charges, less credits, less what was confirmed or is waiting to be.
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
  price := price + COALESCE((SELECT SUM(CASE WHEN "kind" = 'charge' THEN "amountCents" ELSE -"amountCents" END)
                               FROM "BalanceAdjustment" WHERE "guestId" = g."id" AND "removedAt" IS NULL), 0);
  SELECT COALESCE(SUM(CASE WHEN "status" = 'confirmed' THEN "receivedPaymentAmount" ELSE "guestPaymentAmount" END), 0)
    INTO counted
    FROM "Payment" WHERE "guestId" = g."id" AND "status" IN ('reported', 'confirmed');
  IF counted + NEW."guestPaymentAmount" > price THEN
    RAISE EXCEPTION 'more_than_left' USING ERRCODE = '23514';
  END IF;
  NEW."reportedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;
