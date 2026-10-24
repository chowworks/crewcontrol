-- Joining a trip: guests sign in and sign CrewControl's trip agreement. Each trip says whether the organizer accepts
-- them before they pay, or once their payment arrived, or whether confirming payments accepts them first come, first
-- served. Replaces "pay to register". The agreement each guest signed is kept exactly as they saw it, with the terms
-- it quoted, so a later change to the trip never changes what they agreed to.
SET lock_timeout = '10s';

-- ── How a trip takes its crew ────────────────────────────────────────────────
-- 'accept_first': the organizer accepts each guest who signed, and then they pay. 'pay_first': guests sign and pay,
-- and the organizer accepts each one whose payment arrived. 'first_come': guests sign and pay, and confirming a
-- payment accepts them while spots are left. Pay-to-register trips become pay_first, every other trip accept_first.
ALTER TABLE "Trip" ADD COLUMN "joinMode" TEXT NOT NULL DEFAULT 'accept_first';
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_joinMode_check"
  CHECK ("joinMode" IN ('accept_first', 'pay_first', 'first_come'));
UPDATE "Trip" SET "joinMode" = 'pay_first' WHERE "payFirst";

-- Spots taken on a published trip: accepted guests only (owner's decision, 2026-10-21). Replaced before payFirst goes, which the old version read.
CREATE OR REPLACE FUNCTION "public_spots_taken"(trip_id TEXT) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COUNT(*)::INTEGER
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
   WHERE g."tripId" = trip_id AND t."published" AND g."status" = 'approved'
$$;

-- joinMode replaces the pay-to-register option, and the agreement's refund terms replace its pledge.
ALTER TABLE "Trip" DROP COLUMN "payFirst";
ALTER TABLE "Trip" DROP COLUMN "refundPledge";

-- ── Guests sign in ───────────────────────────────────────────────────────────
-- userId is the sign-in provider's user id of the guest who joined. Guests added before sign-in (and the seed's) have
-- none. One sign-up per person per trip. refundSentAt: the organizer turned a paid guest down and says the refund went
-- out. 'declined': turned down.
ALTER TABLE "Guest" ADD COLUMN "userId" TEXT;
ALTER TABLE "Guest" ADD COLUMN "refundSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Guest_tripId_userId_key" ON "Guest"("tripId", "userId");
CREATE INDEX "Guest_userId_idx" ON "Guest"("userId");
-- So a signature can name its guest and trip together, and never a guest of another trip.
CREATE UNIQUE INDEX "Guest_id_tripId_key" ON "Guest"("id", "tripId");

ALTER TABLE "Guest" DROP CONSTRAINT "Guest_status_check";
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_status_check" CHECK ("status" IN ('interested', 'approved', 'declined'));

-- A guest stays with their trip and their person.
DROP TRIGGER "Guest_3_keep" ON "Guest";
CREATE TRIGGER "Guest_3_keep" BEFORE UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'userId');

-- A trip never takes more accepted guests than its limit. Locks the trip, so two confirmations at once can't both take
-- the last spot: the second is refused, and that guest is the one refunded. Runs as the owner to count every guest.
CREATE FUNCTION "guest_spot_fits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  max_guests INTEGER;
  taken INTEGER;
BEGIN
  IF NEW."status" <> 'approved' OR (TG_OP = 'UPDATE' AND OLD."status" = 'approved') THEN
    RETURN NEW;
  END IF;
  SELECT t."maxGuests" INTO max_guests FROM "Trip" t WHERE t."id" = NEW."tripId" FOR UPDATE;
  IF max_guests IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO taken FROM "Guest" g
   WHERE g."tripId" = NEW."tripId" AND g."status" = 'approved' AND g."id" <> NEW."id";
  IF taken >= max_guests THEN
    RAISE EXCEPTION 'trip_full' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_6_spot_fits" BEFORE INSERT OR UPDATE OF "status" ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_spot_fits"();
REVOKE ALL ON FUNCTION "guest_spot_fits"() FROM PUBLIC;

-- ── The signed agreement ─────────────────────────────────────────────────────
-- One per guest, never changed after it is written: what they signed (the text and its SHA-256), the terms it quoted
-- (their balance and plan come from these, not from the trip's current settings), the name they typed, when, and
-- from which address and browser.
CREATE TABLE "AgreementSignature" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "refundTerms" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "AgreementSignature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgreementSignature_guestId_key" ON "AgreementSignature"("guestId");
CREATE UNIQUE INDEX "AgreementSignature_guestId_tripId_key" ON "AgreementSignature"("guestId", "tripId");
CREATE INDEX "AgreementSignature_tripId_idx" ON "AgreementSignature"("tripId");
ALTER TABLE "AgreementSignature" ADD CONSTRAINT "AgreementSignature_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgreementSignature" ADD CONSTRAINT "AgreementSignature_guestId_tripId_fkey" FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "AgreementSignature_3_keep" BEFORE UPDATE ON "AgreementSignature"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'guestId');

-- ── A signed-in guest's own rows ─────────────────────────────────────────────
-- A guest is no trip's member, so they reach only what is theirs: their guest rows, their signatures, and the trips
-- they joined (where the payment instructions are). These read Guest across trips, so they run as the owner.
CREATE FUNCTION "app_guest_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "Guest"
   WHERE "userId" IS NOT NULL AND "userId" = "app_user_id"()
$$;
CREATE FUNCTION "app_guest_trip_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "tripId"), ARRAY[]::TEXT[]) FROM "Guest"
   WHERE "userId" IS NOT NULL AND "userId" = "app_user_id"()
$$;
-- Whether a trip takes sign-ups: a signed-in person who has not joined yet cannot read the trip row itself.
CREATE FUNCTION "trip_is_published"(trip_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT "published" FROM "Trip" WHERE "id" = trip_id), false)
$$;
REVOKE ALL ON FUNCTION "app_guest_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_guest_trip_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "trip_is_published"(TEXT) FROM PUBLIC;

-- A trip is also visible to the guests who joined it.
DROP POLICY "tenant_read" ON "Trip";
CREATE POLICY "tenant_read" ON "Trip" FOR SELECT
  USING ("id" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"())
         OR ((SELECT "app_is_public"()) AND "published")
         OR "id" = ANY ((SELECT "app_guest_trip_ids"())::TEXT[]));

-- Guests: the trip's members read and write them, as before. A signed-in person may join a published trip as
-- themselves, read their own row, and change it only while waiting or accepted, with no payment confirmed and no
-- refund (an accepted guest on an accept-first trip still has to say they paid). The public pages no longer sign anyone up: joining needs sign-in.
DROP POLICY "tenant_read" ON "Guest";
DROP POLICY "tenant_insert" ON "Guest";
DROP POLICY "tenant_update" ON "Guest";
CREATE POLICY "tenant_read" ON "Guest" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "Guest" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("userId" = (SELECT "app_user_id"()) AND "status" = 'interested'
                  AND "paymentSentAt" IS NULL AND "paymentConfirmedAt" IS NULL AND "refundSentAt" IS NULL
                  AND "trip_is_published"("tripId")));
CREATE POLICY "tenant_update" ON "Guest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR ("userId" = (SELECT "app_user_id"()) AND "status" IN ('interested', 'approved')
             AND "paymentConfirmedAt" IS NULL AND "refundSentAt" IS NULL))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("userId" = (SELECT "app_user_id"()) AND "status" IN ('interested', 'approved')
                  AND "paymentConfirmedAt" IS NULL AND "refundSentAt" IS NULL));

-- What a guest may change on their own row: saying they paid (once, stamped now), and their room wish until they are
-- accepted (then the room is the organizer's to change). Everything else
-- (their name, contact details, when they joined, the organizer's fields) is fixed once they've joined; the trip's
-- members change it. Applies only to a signed-in person who is not a member of the guest's trip.
CREATE FUNCTION "guest_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'paymentSentAt' - 'roomId' - 'roomNote')
     IS DISTINCT FROM (to_jsonb(OLD) - 'paymentSentAt' - 'roomId' - 'roomNote')
     OR (NEW."paymentSentAt" IS DISTINCT FROM OLD."paymentSentAt"
         AND (OLD."paymentSentAt" IS NOT NULL OR NEW."paymentSentAt" IS NULL))
     OR (OLD."status" = 'approved'
         AND (NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."roomNote" IS DISTINCT FROM OLD."roomNote")) THEN
    RAISE EXCEPTION 'A guest can only say they paid or change their room wish' USING ERRCODE = '42501';
  END IF;
  -- On an accept-first trip a guest pays only once accepted (they haven't seen how to pay before then).
  IF NEW."paymentSentAt" IS DISTINCT FROM OLD."paymentSentAt" AND OLD."status" <> 'approved'
     AND (SELECT "joinMode" FROM "Trip" WHERE "id" = NEW."tripId") = 'accept_first' THEN
    RAISE EXCEPTION 'A guest on this trip pays once accepted' USING ERRCODE = '42501';
  END IF;
  IF NEW."paymentSentAt" IS DISTINCT FROM OLD."paymentSentAt" THEN
    NEW."paymentSentAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_4_self_limits" BEFORE UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_self_limits"();
REVOKE ALL ON FUNCTION "guest_self_limits"() FROM PUBLIC;

-- A guest's own sign-up and signature carry the database's time, not one the writer chose.
CREATE FUNCTION "stamp_now"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF "app_user_id"() IS NOT NULL AND NOT (NEW."tripId" = ANY ("app_trip_ids"())) THEN
    IF TG_TABLE_NAME = 'Guest' THEN NEW."createdAt" := CURRENT_TIMESTAMP;
    ELSE NEW."signedAt" := CURRENT_TIMESTAMP;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_2_stamp_now" BEFORE INSERT ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "stamp_now"();
CREATE TRIGGER "AgreementSignature_2_stamp_now" BEFORE INSERT ON "AgreementSignature"
  FOR EACH ROW EXECUTE FUNCTION "stamp_now"();
REVOKE ALL ON FUNCTION "stamp_now"() FROM PUBLIC;

-- Signatures: the trip's members read them; a guest reads and writes only their own. Nobody changes or deletes one
-- (a guest's removal takes theirs with it).
ALTER TABLE "AgreementSignature" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "AgreementSignature" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "AgreementSignature" FOR INSERT
  WITH CHECK ("guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]));

-- The Admin toolbox's counts: interested means waiting, not turned down.
CREATE OR REPLACE FUNCTION "admin_trip_counts"()
RETURNS TABLE ("tripId" TEXT, "going" INTEGER, "interested" INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."tripId",
         COUNT(*) FILTER (WHERE g."status" = 'approved')::INTEGER,
         COUNT(*) FILTER (WHERE g."status" = 'interested')::INTEGER
    FROM "Guest" g
   WHERE "app_is_admin"()
   GROUP BY g."tripId"
$$;

-- The restricted role may use the new functions straight away, not only once the deploy's role:ensure step runs
-- (src/core/app-role-grants.ts lists them; role:ensure grants the same on every deploy).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "app_guest_ids"(), "app_guest_trip_ids"(), "trip_is_published"(TEXT) TO cc_app;
  END IF;
END $$;
