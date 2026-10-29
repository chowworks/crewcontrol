-- Forwarded receipts (issue #12, "receipts@"): a guest or organizer forwards a Zelle, Cash App or bank email to the
-- trip's own address, and it becomes a reported payment on the right guest for the organizer to confirm, as a guest's
-- own report does. What can't be matched waits in Trip Control's Actions. Records money only; never moves it.
-- Modeled on Audit Differently's emailed receipts (its migration 20261017000400_receipts_address_history).
SET lock_timeout = '10s';

-- ── The trip's address ───────────────────────────────────────────────────────
-- The part before the @; the domain is the environment's (RECEIPTS_DOMAIN). Its members set it, may change it, and
-- never clear it. Unique while in use; the history below keeps every address used. Never a mailbox name that mail
-- servers and certificate authorities write to (postmaster, abuse and the like), so nobody's trip receives that mail.
ALTER TABLE "Trip" ADD COLUMN "receiptsAddress" TEXT;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_receiptsAddress_check"
  CHECK ("receiptsAddress" ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
         AND "receiptsAddress" NOT IN ('admin', 'administrator', 'postmaster', 'hostmaster', 'webmaster', 'abuse',
                                       'root', 'security', 'support', 'noreply', 'no-reply', 'mailer-daemon',
                                       'info', 'receipts'));
CREATE UNIQUE INDEX "Trip_receiptsAddress_key" ON "Trip"("receiptsAddress");

-- Changed, never cleared, except by the tables' owner (migrations, the seed). Not SECURITY DEFINER, so current_user is
-- the role that writes.
CREATE FUNCTION "trip_receipts_address_kept"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."receiptsAddress" IS NOT NULL AND NEW."receiptsAddress" IS NULL
     AND NOT pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RAISE EXCEPTION 'A receipts address is changed, never cleared' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Trip_6_receipts_address_kept" BEFORE UPDATE OF "receiptsAddress" ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "trip_receipts_address_kept"();
REVOKE ALL ON FUNCTION "trip_receipts_address_kept"() FROM PUBLIC;

-- ── Every address used ───────────────────────────────────────────────────────
-- One row per address a trip has used. An address is held by at most one row not released, current or used before,
-- so a retired address is never chosen again (mail still sent to it could land on another trip) until the platform
-- admin releases it in the Admin toolbox, judging by how much mail still reached it since it was retired. Organizers
-- never see past addresses. Not trip data: it must outlive its trip (a deleted trip's address stays held), so
-- `tripId` is a plain id with no foreign key. Read only by the admin's mark and trusted work.
CREATE TABLE "ReceiptsAddress" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "address" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releasedByUserId" TEXT,
  CONSTRAINT "ReceiptsAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceiptsAddress_address_check" CHECK ("address" ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  CONSTRAINT "ReceiptsAddress_released_check" CHECK (
    ("releasedAt" IS NULL OR "removedAt" IS NOT NULL)
    AND ("releasedAt" IS NOT NULL OR "releasedByUserId" IS NULL))
);
CREATE UNIQUE INDEX "ReceiptsAddress_address_held_key" ON "ReceiptsAddress"("address") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX "ReceiptsAddress_tripId_current_key" ON "ReceiptsAddress"("tripId") WHERE "removedAt" IS NULL;

-- The history follows the trip, written by the database, never the API: a new address is added (refused by the index
-- above while a row not released holds it), the one it replaces is marked removed, and so is a deleted trip's.
CREATE FUNCTION "trip_receipts_address_history"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  before TEXT := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD."receiptsAddress" END;
  after TEXT := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW."receiptsAddress" END;
  trip TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
BEGIN
  IF before IS NOT DISTINCT FROM after THEN
    RETURN NULL;
  END IF;
  IF before IS NOT NULL THEN
    UPDATE "ReceiptsAddress" SET "removedAt" = CURRENT_TIMESTAMP WHERE "address" = before AND "removedAt" IS NULL;
  END IF;
  IF after IS NOT NULL THEN
    INSERT INTO "ReceiptsAddress" ("address", "tripId") VALUES (after, trip);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "Trip_9_receipts_address_history" AFTER INSERT OR UPDATE OF "receiptsAddress" OR DELETE ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "trip_receipts_address_history"();
REVOKE ALL ON FUNCTION "trip_receipts_address_history"() FROM PUBLIC;

-- What changes on a row once written: the history function (as the owner) marks it removed, and the admin's mark
-- releases a retired one, which then never changes again. Not SECURITY DEFINER, so current_user is the writer.
CREATE FUNCTION "receipts_address_keep"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."releasedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'A released receipts address is kept as it was released' USING ERRCODE = '42501';
  END IF;
  IF pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RETURN NEW;
  END IF;
  IF NOT "app_is_admin"() THEN
    RAISE EXCEPTION 'Only a platform admin releases a receipts address' USING ERRCODE = '42501';
  END IF;
  IF OLD."removedAt" IS NULL THEN
    RAISE EXCEPTION 'A trip''s current receipts address is never released' USING ERRCODE = '42501';
  END IF;
  IF NEW."releasedAt" IS NULL
     OR (to_jsonb(NEW) - 'releasedAt' - 'releasedByUserId') IS DISTINCT FROM (to_jsonb(OLD) - 'releasedAt' - 'releasedByUserId') THEN
    RAISE EXCEPTION 'A platform admin only releases a receipts address' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ReceiptsAddress_3_keep" BEFORE UPDATE ON "ReceiptsAddress"
  FOR EACH ROW EXECUTE FUNCTION "receipts_address_keep"();
REVOKE ALL ON FUNCTION "receipts_address_keep"() FROM PUBLIC;

-- Releasing: the database says who and when, never the client, and the address's kept refused emails go in the same
-- statement, so if it is used and retired again its count starts at zero. The reason below is RETIRED in
-- src/receipts/forwarded-queue.ts, word for word.
CREATE FUNCTION "receipts_address_release"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD."releasedAt" IS NOT NULL OR NEW."releasedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF "app_is_admin"() THEN
    NEW."releasedAt" := CURRENT_TIMESTAMP;
    NEW."releasedByUserId" := "app_user_id"();
  END IF;
  DELETE FROM "ForwardedReceipt"
   WHERE "tripId" IS NULL AND "status" = 'rejected' AND "fromAddress" IS NULL
     AND "reason" = 'This address is no longer in use'
     AND split_part("toAddress", '@', 1) = OLD."address";
  RETURN NEW;
END $$;

ALTER TABLE "ReceiptsAddress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "ReceiptsAddress" FOR SELECT
  USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_insert" ON "ReceiptsAddress" FOR INSERT WITH CHECK (false);
CREATE POLICY "tenant_update" ON "ReceiptsAddress" FOR UPDATE
  USING ((SELECT "app_is_admin"()) AND "removedAt" IS NOT NULL AND "releasedAt" IS NULL)
  WITH CHECK ((SELECT "app_is_admin"()) AND "releasedAt" IS NOT NULL);
CREATE POLICY "tenant_delete" ON "ReceiptsAddress" FOR DELETE USING (false);

-- Whether an address is taken, in use or retired and not released, for the organizer's form: yes or no only, which
-- the unique indexes already tell anyone who tries.
CREATE FUNCTION "receipts_address_taken"(local_part TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "ReceiptsAddress" WHERE "address" = local_part AND "releasedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM "Trip" WHERE "receiptsAddress" = local_part)
$$;
REVOKE ALL ON FUNCTION "receipts_address_taken"(TEXT) FROM PUBLIC;

-- ── The emails received ──────────────────────────────────────────────────────
-- One row per email Resend received for an address on our receipts domain, once per Resend id. The webhook queues it
-- (status 'received'); the API's worker reads it, finds the trip from the address and the guest from the sender or
-- the name in the email, and records a reported payment ('recorded'), or leaves it for the organizer ('unmatched'),
-- or refuses it ('rejected': nobody's address, or not a payment from anyone we know). A provider failure is tried
-- again with a backoff, and fails for good after five tries ('failed'). An organizer matches an unmatched one to a
-- guest ('recorded') or dismisses it ('dismissed'). Mail to a retired address is kept with no sender and no subject,
-- only so the Admin toolbox can count it until the address is released.
CREATE TABLE "ForwardedReceipt" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "emailId" TEXT NOT NULL,
  "toAddress" TEXT,
  "fromAddress" TEXT,
  "subject" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tripId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Why it was refused, left for the organizer or dismissed, in words; and the last failure, when there was one.
  "reason" TEXT,
  "error" TEXT,
  -- Resend found the sender's domain vouched for the From address (DMARC passed).
  "senderVerified" BOOLEAN NOT NULL DEFAULT false,
  -- What was read from it: the amount in whole cents, who paid, how, the day, and the start of its text for the
  -- organizer to read when it needs matching (cleared once it's dealt with).
  "amountCents" INTEGER,
  "payerName" TEXT NOT NULL DEFAULT '',
  "methodKind" TEXT,
  "sentOn" TEXT,
  "excerpt" TEXT NOT NULL DEFAULT '',
  -- The guest it most likely is, when it waits for the organizer; the guest it was filed on and the payment it made.
  "suggestedGuestId" TEXT,
  "guestId" TEXT,
  "paymentId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForwardedReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForwardedReceipt_status_check"
    CHECK ("status" IN ('received', 'processing', 'recorded', 'unmatched', 'dismissed', 'rejected', 'failed')),
  CONSTRAINT "ForwardedReceipt_amount_check" CHECK ("amountCents" IS NULL OR "amountCents" > 0),
  CONSTRAINT "ForwardedReceipt_methodKind_check"
    CHECK ("methodKind" IS NULL OR "methodKind" IN ('cashapp', 'zelle', 'venmo', 'paypal', 'applecash', 'custom', 'other')),
  -- An organizer deals only with a row of a trip.
  CONSTRAINT "ForwardedReceipt_trip_check" CHECK ("status" NOT IN ('recorded', 'unmatched', 'dismissed') OR "tripId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ForwardedReceipt_emailId_key" ON "ForwardedReceipt"("emailId");
CREATE INDEX "ForwardedReceipt_tripId_status_idx" ON "ForwardedReceipt"("tripId", "status");
CREATE INDEX "ForwardedReceipt_status_nextAttemptAt_idx" ON "ForwardedReceipt"("status", "nextAttemptAt");
CREATE INDEX "ForwardedReceipt_receivedAt_idx" ON "ForwardedReceipt"("receivedAt");
-- One receipt per payment it made, so its proof is never another's.
CREATE UNIQUE INDEX "ForwardedReceipt_paymentId_key" ON "ForwardedReceipt"("paymentId") WHERE "paymentId" IS NOT NULL;
-- A trip's emails hold its guests' names and payments: they go with the trip. (Mail to a retired address has no trip.)
ALTER TABLE "ForwardedReceipt" ADD CONSTRAINT "ForwardedReceipt_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "ReceiptsAddress_4_release" BEFORE UPDATE ON "ReceiptsAddress"
  FOR EACH ROW EXECUTE FUNCTION "receipts_address_release"();
REVOKE ALL ON FUNCTION "receipts_address_release"() FROM PUBLIC;

-- What a trip's members may change on a row: an unmatched one becomes recorded (with its guest and the email payment
-- just made for it, its text kept as proof) or dismissed (with why, its text cleared), by them, now; nothing else. The admin's mark puts a failed one back in the queue. Trusted
-- work and the owner change anything. Not SECURITY DEFINER, so current_user is the writer.
CREATE FUNCTION "forwarded_receipt_keep"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed JSONB := to_jsonb(OLD) - 'status' - 'guestId' - 'paymentId' - 'reason' - 'excerpt' - 'decidedAt'
                 - 'decidedByUserId' - 'updatedAt';
  queued JSONB := to_jsonb(OLD) - 'status' - 'attempts' - 'nextAttemptAt' - 'error' - 'reason' - 'updatedAt';
BEGIN
  IF "app_is_system"()
     OR pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RETURN NEW;
  END IF;
  IF "app_is_admin"() AND OLD."status" = 'failed' AND NEW."status" = 'received'
     AND (to_jsonb(NEW) - 'status' - 'attempts' - 'nextAttemptAt' - 'error' - 'reason' - 'updatedAt') = queued THEN
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'unmatched' OR NEW."status" NOT IN ('recorded', 'dismissed')
     OR (to_jsonb(NEW) - 'status' - 'guestId' - 'paymentId' - 'reason' - 'excerpt' - 'decidedAt'
         - 'decidedByUserId' - 'updatedAt') IS DISTINCT FROM fixed
     OR NEW."decidedByUserId" IS DISTINCT FROM "app_user_id"() THEN
    RAISE EXCEPTION 'An organizer only matches or dismisses a receipt that needs it' USING ERRCODE = '42501';
  END IF;
  IF NEW."status" = 'recorded' AND (NEW."guestId" IS NULL OR NEW."paymentId" IS NULL
     OR NOT EXISTS (SELECT 1 FROM "Guest" WHERE "id" = NEW."guestId" AND "tripId" = NEW."tripId")
     OR NOT EXISTS (SELECT 1 FROM "Payment" WHERE "id" = NEW."paymentId" AND "guestId" = NEW."guestId"
                    AND "tripId" = NEW."tripId" AND "loggedBy" = 'email')
     OR NEW."excerpt" IS DISTINCT FROM OLD."excerpt" OR NEW."reason" IS DISTINCT FROM OLD."reason") THEN
    RAISE EXCEPTION 'A matched receipt names its guest and payment' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'dismissed' AND (NEW."excerpt" <> '' OR NEW."guestId" IS NOT NULL OR NEW."paymentId" IS NOT NULL) THEN
    RAISE EXCEPTION 'A dismissed receipt keeps no payment and no text' USING ERRCODE = '23514';
  END IF;
  NEW."decidedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;
CREATE TRIGGER "ForwardedReceipt_3_keep" BEFORE UPDATE ON "ForwardedReceipt"
  FOR EACH ROW EXECUTE FUNCTION "forwarded_receipt_keep"();
REVOKE ALL ON FUNCTION "forwarded_receipt_keep"() FROM PUBLIC;

-- Trusted work writes and removes rows; a trip's members read theirs and deal with the unmatched ones; the admin's mark
-- reads every row (the Admin toolbox's Forwarded receipts) and puts a failed one back in the queue.
ALTER TABLE "ForwardedReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "ForwardedReceipt" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "ForwardedReceipt" FOR INSERT WITH CHECK ((SELECT "app_is_system"()));
CREATE POLICY "tenant_update" ON "ForwardedReceipt" FOR UPDATE
  USING ((SELECT "app_is_system"())
         OR ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "status" = 'unmatched')
         OR ((SELECT "app_is_admin"()) AND "status" = 'failed'))
  WITH CHECK ((SELECT "app_is_system"())
              OR ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "status" IN ('recorded', 'dismissed'))
              OR ((SELECT "app_is_admin"()) AND "status" = 'received'));
CREATE POLICY "tenant_delete" ON "ForwardedReceipt" FOR DELETE USING ((SELECT "app_is_system"()));

-- ── Senders an organizer vouched for ─────────────────────────────────────────
-- When an organizer matches a receipt from someone not on the trip (a parent paying for a child), they may have that
-- address remembered for the guest: its next forwards are filed on that guest as their own would be (owner's decision,
-- 2026-10-29), still only when the sender check passes. Never typed by a guest, so nobody can claim another's receipts.
CREATE TABLE "PayerAddress" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tripId" TEXT NOT NULL,
  "guestId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT NOT NULL,
  CONSTRAINT "PayerAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayerAddress_address_check" CHECK ("address" = lower("address") AND "address" LIKE '%_@_%')
);
-- One guest per address on a trip.
CREATE UNIQUE INDEX "PayerAddress_tripId_address_key" ON "PayerAddress"("tripId", "address");
CREATE INDEX "PayerAddress_guestId_idx" ON "PayerAddress"("guestId");
ALTER TABLE "PayerAddress" ADD CONSTRAINT "PayerAddress_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayerAddress" ADD CONSTRAINT "PayerAddress_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "PayerAddress_3_keep" BEFORE UPDATE ON "PayerAddress"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'guestId');

-- The trip's members read, add and remove them; trusted work reads them; nobody else.
ALTER TABLE "PayerAddress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "PayerAddress" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_insert" ON "PayerAddress" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "createdByUserId" = "app_user_id"());
CREATE POLICY "tenant_update" ON "PayerAddress" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "createdByUserId" = "app_user_id"());
CREATE POLICY "tenant_delete" ON "PayerAddress" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- ── A payment from a forwarded receipt ───────────────────────────────────────
-- Logged by 'email': still the guest's word until the organizer confirms it, shown as from a forwarded receipt.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_loggedBy_check";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loggedBy_check" CHECK ("loggedBy" IN ('guest', 'organizer', 'email'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "receipts_address_taken"(TEXT) TO cc_app;
  END IF;
END $$;
