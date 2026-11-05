-- A payment marked not received (owner's decisions, 2026-11-05): the organizer may say why, and the guest is emailed
-- about it a minute later, so an Undo in that minute sends nothing. Adds two columns; no data is changed.
SET lock_timeout = '10s';

-- Why it didn't arrive, in the organizer's words ('' when they gave none). Shown to the guest and in the email.
ALTER TABLE "Payment" ADD COLUMN "decisionNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_decisionNote_check" CHECK (length("decisionNote") <= 200);

-- When the "Payment not received" email is due; cleared when it goes, or when the decision changes before then.
ALTER TABLE "Payment" ADD COLUMN "notifyGuestAt" TIMESTAMP(3);
CREATE INDEX "Payment_notifyGuestAt_idx" ON "Payment" ("notifyGuestAt") WHERE "notifyGuestAt" IS NOT NULL;
