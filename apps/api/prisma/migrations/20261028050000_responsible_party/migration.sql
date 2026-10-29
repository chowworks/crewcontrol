-- Signing up and paying for other travelers (issue #11, owner's decisions 2026-10-28): a parent for their kids, or one
-- friend for a roommate. The person responsible signs each traveler up from their own account, signing the agreement
-- on that traveler's behalf, and pays for any of them. Each traveler is still their own guest, with their own spot,
-- signature and balance; managedByUserId says whose account looks after them. They may be on the trip themselves or
-- not. A traveler who later signs in with the email they were signed up with may take over their own row, once they
-- say it is them (claim_managed_guest); the person responsible still sees it and can pay for it. Organizers can hand a
-- signed-up guest to another guest on the trip who has an account.
SET lock_timeout = '10s';

ALTER TABLE "Guest" ADD COLUMN "managedByUserId" TEXT;
CREATE INDEX "Guest_managedByUserId_idx" ON "Guest"("managedByUserId");

-- Who sent a payment for someone else, by name, when it wasn't the traveler themselves ('' when it was).
ALTER TABLE "Payment" ADD COLUMN "paidByName" TEXT NOT NULL DEFAULT '';

-- One transfer that pays for several travelers: a payment row each (their balances), sharing this, so the organizer
-- confirms the transfer once (owner's decision, 2026-10-28). Null for a payment for one person.
ALTER TABLE "Payment" ADD COLUMN "transferId" TEXT;
CREATE INDEX "Payment_tripId_transferId_idx" ON "Payment"("tripId", "transferId");

-- Whose account signed an agreement on a traveler's behalf (null when the traveler signed it themselves).
ALTER TABLE "AgreementSignature" ADD COLUMN "signedByUserId" TEXT;

-- Travelers signed up by someone else may share that person's email (a child without one uses their parent's), so
-- one email per trip holds only for people who signed up themselves. guest_waitlist keeps a traveler someone signs
-- up from taking the email of someone who signed up themselves.
DO $$
BEGIN
  DROP INDEX IF EXISTS "Guest_tripId_email_key";
  IF NOT EXISTS (SELECT 1 FROM "Guest" WHERE "managedByUserId" IS NULL
                  GROUP BY "tripId", lower("email") HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX "Guest_tripId_email_key" ON "Guest" ("tripId", lower("email"))
      WHERE "managedByUserId" IS NULL;
  END IF;
END $$;

-- ── What the person responsible reaches ──────────────────────────────────────
-- The travelers they look after count as their own: their signatures and payments (the AgreementSignature and Payment
-- policies use these), and the trips they're on, where the payment instructions are.
CREATE OR REPLACE FUNCTION "app_guest_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "Guest"
   WHERE "app_user_id"() IS NOT NULL AND ("userId" = "app_user_id"() OR "managedByUserId" = "app_user_id"())
$$;
CREATE OR REPLACE FUNCTION "app_guest_trip_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "tripId"), ARRAY[]::TEXT[]) FROM "Guest"
   WHERE "app_user_id"() IS NOT NULL AND ("userId" = "app_user_id"() OR "managedByUserId" = "app_user_id"())
$$;

-- A signed-in person reads their own row and the rows they look after; joins a published trip as themselves, or
-- signs up someone else there (no account of the traveler's yet, theirs as the person responsible); and changes a
-- room wish on their own row, or on one they look after that the traveler hasn't taken over, while waiting or
-- accepted, with the spot not yet paid and no refund.
DROP POLICY "tenant_read" ON "Guest";
DROP POLICY "tenant_insert" ON "Guest";
DROP POLICY "tenant_update" ON "Guest";
CREATE POLICY "tenant_read" ON "Guest" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"())
         OR "managedByUserId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "Guest" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ((("userId" = (SELECT "app_user_id"()) AND "managedByUserId" IS NULL)
                   OR ("userId" IS NULL AND "managedByUserId" = (SELECT "app_user_id"())))
                  AND "status" = 'interested' AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL
                  AND "trip_is_published"("tripId")));
CREATE POLICY "tenant_update" ON "Guest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR (("userId" = (SELECT "app_user_id"())
              OR ("userId" IS NULL AND "managedByUserId" = (SELECT "app_user_id"())))
             AND "status" IN ('interested', 'approved') AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR (("userId" = (SELECT "app_user_id"())
                   OR ("userId" IS NULL AND "managedByUserId" = (SELECT "app_user_id"())))
                  AND "status" IN ('interested', 'approved') AND "spotPaidAt" IS NULL AND "refundSentAt" IS NULL));

-- ── Signing someone up ───────────────────────────────────────────────────────
-- A traveler someone signs up follows the signer (owner's decision, 2026-10-28: "if I can't go, you can't either"):
-- on a full trip they wait; otherwise, when the signer is on the trip, they wait if the signer waits and join the line
-- with the signer if not, even past the buffer; when the signer isn't going, the trip's waitlist decides as for anyone.
-- At most ten travelers a person per trip, and never with the email of someone who signed up themselves (other than
-- the signer): that person is on the trip already. Joining as themselves works as before.
CREATE OR REPLACE FUNCTION "guest_waitlist"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  max_guests INTEGER;
  signer "Guest";
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  SELECT "maxGuests" INTO max_guests FROM "Trip" WHERE "id" = NEW."tripId" FOR UPDATE;
  IF NEW."userId" IS NULL AND NEW."managedByUserId" IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM "Guest"
         WHERE "tripId" = NEW."tripId" AND "managedByUserId" = NEW."managedByUserId") >= 10 THEN
      RAISE EXCEPTION 'too_many_travelers' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "Guest"
                WHERE "tripId" = NEW."tripId" AND "managedByUserId" IS NULL AND lower("email") = lower(NEW."email")
                  AND "userId" IS DISTINCT FROM NEW."managedByUserId") THEN
      RAISE EXCEPTION 'email_taken' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO signer FROM "Guest"
     WHERE "tripId" = NEW."tripId" AND "userId" = NEW."managedByUserId" AND "status" <> 'declined';
    NEW."waitlistedAt" := CASE
      WHEN max_guests IS NOT NULL
           AND (SELECT COUNT(*) FROM "Guest" WHERE "tripId" = NEW."tripId" AND "status" = 'approved') >= max_guests
        THEN CURRENT_TIMESTAMP
      WHEN signer."id" IS NOT NULL
        THEN CASE WHEN signer."status" = 'interested' AND signer."waitlistedAt" IS NOT NULL
                       AND signer."offeredAt" IS NULL THEN CURRENT_TIMESTAMP END
      WHEN "trip_waitlisting"(NEW."tripId") THEN CURRENT_TIMESTAMP
    END;
  ELSE
    NEW."waitlistedAt" := CASE WHEN "trip_waitlisting"(NEW."tripId") THEN CURRENT_TIMESTAMP END;
  END IF;
  NEW."offeredAt" := NULL;
  RETURN NEW;
END $$;

-- Who may look after a guest. Signing someone up, only the signer themselves. Afterwards (an organizer handing them
-- to someone else), only another guest on the same trip with an account, and only for a guest who has signed the
-- agreement: an organizer can never make themselves, or anyone off the trip, the signer of a guest's agreement.
CREATE FUNCTION "guest_manager_fits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."managedByUserId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."managedByUserId" IS DISTINCT FROM "app_user_id"() THEN
      RAISE EXCEPTION 'Only the person signing a traveler up looks after them' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."managedByUserId" IS NOT DISTINCT FROM OLD."managedByUserId" THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Guest" WHERE "tripId" = NEW."tripId" AND "userId" = NEW."managedByUserId"
                                         AND "id" <> NEW."id")
     OR NOT EXISTS (SELECT 1 FROM "AgreementSignature" WHERE "guestId" = NEW."id") THEN
    RAISE EXCEPTION 'manager_not_on_trip' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "guest_manager_fits"() FROM PUBLIC;
CREATE TRIGGER "Guest_7_manager_fits" BEFORE INSERT OR UPDATE OF "managedByUserId" ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_manager_fits"();

-- ── Taking over one's own row ────────────────────────────────────────────────
-- A guest's trip and account never change, except once: a traveler someone else signed up (no account yet) gets the
-- account of the traveler when they say it's them (claim_managed_guest, which marks the step it is taking).
CREATE FUNCTION "guest_keep"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tripId" IS DISTINCT FROM OLD."tripId" THEN
    RAISE EXCEPTION 'Guest.tripId cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW."userId" IS DISTINCT FROM OLD."userId"
     AND NOT (OLD."userId" IS NULL AND OLD."managedByUserId" IS NOT NULL
              AND current_setting('app.claiming', true) = OLD."id")
     AND NOT (NEW."userId" IS NULL AND OLD."status" = 'declined'
              AND current_setting('app.claiming', true) = 'release:' || OLD."id") THEN
    RAISE EXCEPTION 'Guest.userId cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "guest_keep"() FROM PUBLIC;
DROP TRIGGER "Guest_3_keep" ON "Guest";
CREATE TRIGGER "Guest_3_keep" BEFORE UPDATE ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_keep"();

-- The signed-in caller and the row someone signed them up with on this trip: the one traveler with no account yet
-- whose email is one of the caller's verified emails (the API passes them, from the sign-in provider), not one the
-- caller signed up themselves, and only if the caller isn't on the trip already. A place of their own that an organizer
-- turned down, with no payment on it, doesn't count: that's how an organizer undoes someone joining themselves by
-- mistake ("Not me"), and taking the right place lets go of it. Returns the name it was signed with (null when there's
-- none); with `take`, once the caller said it's them, the row becomes theirs.
CREATE FUNCTION "claim_managed_guest"(trip_slug TEXT, emails TEXT[], take BOOLEAN) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me TEXT := "app_user_id"();
  trip_id TEXT;
  found TEXT[];
  signer TEXT;
  own "Guest";
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT "id" INTO trip_id FROM "Trip" WHERE "slug" = trip_slug AND "published";
  IF trip_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO own FROM "Guest" WHERE "tripId" = trip_id AND "userId" = me;
  IF own."id" IS NOT NULL
     AND (own."status" <> 'declined'
          OR EXISTS (SELECT 1 FROM "Payment" WHERE "guestId" = own."id" AND "status" IN ('reported', 'confirmed', 'refunded'))) THEN
    RETURN NULL;
  END IF;
  SELECT array_agg("id") INTO found FROM "Guest"
   WHERE "tripId" = trip_id AND "userId" IS NULL AND "managedByUserId" IS NOT NULL AND "managedByUserId" <> me
     AND "status" <> 'declined' AND lower("email") = ANY (SELECT lower(e) FROM unnest(emails) e);
  -- Two travelers signed up with the same email (a parent's): nobody can tell which one this is.
  IF found IS NULL OR array_length(found, 1) <> 1 THEN RETURN NULL; END IF;
  SELECT COALESCE(s."typedName", '') INTO signer
    FROM "Guest" g LEFT JOIN "AgreementSignature" s ON s."guestId" = g."id" WHERE g."id" = found[1];
  IF take THEN
    IF own."id" IS NOT NULL THEN
      PERFORM set_config('app.claiming', 'release:' || own."id", true);
      UPDATE "Guest" SET "userId" = NULL WHERE "id" = own."id";
    END IF;
    PERFORM set_config('app.claiming', found[1], true);
    UPDATE "Guest" SET "userId" = me WHERE "id" = found[1];
    PERFORM set_config('app.claiming', '', true);
  END IF;
  RETURN signer;
END $$;
REVOKE ALL ON FUNCTION "claim_managed_guest"(TEXT, TEXT[], BOOLEAN) FROM PUBLIC;

-- What a guest may change on their own row: their room wish until they are accepted, and, once, the account on a row
-- someone signed them up with, to their own (claim_managed_guest; never the person responsible taking it).
CREATE OR REPLACE FUNCTION "guest_self_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF "app_user_id"() IS NULL OR NEW."tripId" = ANY ("app_trip_ids"()) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'roomId' - 'roomNote' - 'spotPaidAt' - 'userId')
     IS DISTINCT FROM (to_jsonb(OLD) - 'roomId' - 'roomNote' - 'spotPaidAt' - 'userId')
     OR (NEW."userId" IS DISTINCT FROM OLD."userId"
         AND (NEW."userId" IS DISTINCT FROM "app_user_id"() OR NEW."userId" = OLD."managedByUserId")
         AND NOT (NEW."userId" IS NULL AND OLD."userId" = "app_user_id"() AND OLD."status" = 'declined'
                  AND current_setting('app.claiming', true) = 'release:' || OLD."id"))
     OR (OLD."status" = 'approved'
         AND (NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."roomNote" IS DISTINCT FROM OLD."roomNote")) THEN
    RAISE EXCEPTION 'A guest can only change their room wish' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ── History ──────────────────────────────────────────────────────────────────
-- What the person responsible does for a traveler is the guest's side, not the organizer's.
CREATE OR REPLACE FUNCTION "guest_event"(g "Guest", kind TEXT, at TIMESTAMP(3), from_room TEXT, to_room TEXT,
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
               WHEN who = g."userId" OR who = g."managedByUserId" THEN 'guest' ELSE 'organizer' END,
          from_room, to_room, fields, payment_id, amount);
END $$;

-- The restricted role may look up and take over its own row straight away (src/core/app-role-grants.ts lists it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "claim_managed_guest"(TEXT, TEXT[], BOOLEAN) TO cc_app;
  END IF;
END $$;
