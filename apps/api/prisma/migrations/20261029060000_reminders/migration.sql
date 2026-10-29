-- Scheduled reminders (issue #12): a key date can email guests some days before it, and a payment-due date emails the
-- guests who owe something by then. Each reminder email carries "Stop updates for this trip" (owner's decision,
-- 2026-10-29: optional emails need a way out; trip business emails do not), saved per guest.
SET lock_timeout = '10s';

-- ── The payment plan ─────────────────────────────────────────────────────────
-- The agreement guests sign matches what the trip editor set (owner's decision, 2026-10-29): one due date per
-- installment ('YYYY-MM-DD'), or none yet; the first payment, when the organizer sets one (null: an even split); and
-- the days before each due date that guests who still owe are reminded (null: no payment reminders). The API checks
-- them; the database keeps the shapes.
ALTER TABLE "Trip" ADD COLUMN "paymentDueDates" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Trip" ADD COLUMN "paymentReminderDays" INTEGER;
ALTER TABLE "Trip" ADD COLUMN "firstPaymentCents" INTEGER;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_firstPaymentCents_check"
  CHECK ("firstPaymentCents" IS NULL OR "firstPaymentCents" > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_paymentDueDates_check" CHECK (jsonb_typeof("paymentDueDates") = 'array');
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_paymentReminderDays_check"
  CHECK ("paymentReminderDays" IS NULL OR "paymentReminderDays" BETWEEN 0 AND 60);

-- Each signature keeps the plan it quoted ([{"dueOn": 'YYYY-MM-DD' or null, "amountCents": n}, ...]), so a guest's
-- schedule, like their price, is what they signed. Agreements from before keep [] (an even split, no dates).
ALTER TABLE "AgreementSignature" ADD COLUMN "schedule" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AgreementSignature" ADD CONSTRAINT "AgreementSignature_schedule_check"
  CHECK (jsonb_typeof("schedule") = 'array');

-- The payment that holds a spot is the first one the guest's plan asks for (as before, an even share when their
-- agreement has no plan), never more than they owe in all once credits and charges count.
CREATE OR REPLACE FUNCTION "spot_due"(g "Guest") RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  price INTEGER;
  first INTEGER;
BEGIN
  SELECT COALESCE(s."priceCents", t."costPerPersonCents"),
         CASE WHEN jsonb_array_length(COALESCE(s."schedule", '[]')) > 0
              THEN (s."schedule"->0->>'amountCents')::INTEGER
              WHEN COALESCE(s."installmentCount", t."installmentCount") <= 1
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

-- ── Stop updates ─────────────────────────────────────────────────────────────
-- The link names the guest by a secret of their own, never by id. Trusted work looks it up and sets the time.
ALTER TABLE "Guest" ADD COLUMN "updatesStoppedAt" TIMESTAMP(3);
ALTER TABLE "Guest" ADD COLUMN "updatesToken" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT;
CREATE UNIQUE INDEX "Guest_updatesToken_key" ON "Guest"("updatesToken");

-- ── What went out ────────────────────────────────────────────────────────────
-- One row per reminder per guest, written before the email goes, so a reminder never goes twice.
CREATE TABLE "ReminderSend" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    -- The key date: its date and what happens, as the organizer wrote them.
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "paymentDue" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderSend_guestId_key_key" ON "ReminderSend"("guestId", "key");
CREATE INDEX "ReminderSend_tripId_idx" ON "ReminderSend"("tripId");
ALTER TABLE "ReminderSend" ADD CONSTRAINT "ReminderSend_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A reminder names its guest and trip together, so it never points at another trip's guest.
ALTER TABLE "ReminderSend" ADD CONSTRAINT "ReminderSend_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only trusted work (the reminder run) writes them; the trip's members and the admin read them. Never changed.
ALTER TABLE "ReminderSend" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "ReminderSend" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "ReminderSend" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "ReminderSend" FOR INSERT WITH CHECK ((SELECT "app_is_system"()));
