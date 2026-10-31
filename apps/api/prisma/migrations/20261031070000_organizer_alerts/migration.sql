-- Organizer alerts and the sent-email log (owner's decisions, 2026-10-31).
--
-- EmailSend: every email Travel HQ sends, for the Admin toolbox's Sent Emails page and so the alerts know when a
-- person was last emailed. The envelope only (kind, address, subject, trip, Resend's id and what Resend said became of
-- it), never the body, which can hold payment details. Kept 30 days. Read by the admin and trusted work; written only
-- by trusted work (the API's sending, and Resend's webhook for the status). A line outlives its trip (the seed
-- replacing the sample trips, a deleted trip erased) without the trip, until its 30 days are up.
--
-- ActionAlert: which of Trip Control's Actions each organizer was already emailed about, so an alert only ever names
-- what's new. A row goes when its action is done. Trusted work only; nobody reads it.
--
-- SystemSettings.alertWindowHours: after an alert, how long before the next one to the same person (default 4).
SET lock_timeout = '10s';

ALTER TABLE "SystemSettings" ADD COLUMN "alertWindowHours" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_alertWindowHours_check"
  CHECK ("alertWindowHours" BETWEEN 1 AND 24);

CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "kind" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "tripId" TEXT,
    "resendId" TEXT,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailSend_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailSend_status_check" CHECK ("status" IN
      ('sent', 'mocked', 'not_deliverable', 'failed', 'delivered', 'delayed', 'bounced', 'blocked', 'complained')),
    CONSTRAINT "EmailSend_toAddress_check" CHECK (length("toAddress") <= 254 AND "toAddress" = lower("toAddress")),
    CONSTRAINT "EmailSend_subject_check" CHECK (length("subject") <= 300),
    CONSTRAINT "EmailSend_detail_check" CHECK (length("detail") <= 500)
);
CREATE INDEX "EmailSend_sentAt_idx" ON "EmailSend"("sentAt");
CREATE INDEX "EmailSend_tripId_idx" ON "EmailSend"("tripId");
CREATE INDEX "EmailSend_resendId_idx" ON "EmailSend"("resendId");
CREATE INDEX "EmailSend_toAddress_kind_idx" ON "EmailSend"("toAddress", "kind");

ALTER TABLE "EmailSend" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "EmailSend" FOR SELECT
  USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_insert" ON "EmailSend" FOR INSERT WITH CHECK ((SELECT "app_is_system"()));
CREATE POLICY "tenant_update" ON "EmailSend" FOR UPDATE
  USING ((SELECT "app_is_system"())) WITH CHECK ((SELECT "app_is_system"()));
CREATE POLICY "tenant_delete" ON "EmailSend" FOR DELETE USING ((SELECT "app_is_system"()));

CREATE TABLE "ActionAlert" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "alertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionAlert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActionAlert_userId_tripId_key_key" ON "ActionAlert"("userId", "tripId", "key");
CREATE INDEX "ActionAlert_tripId_idx" ON "ActionAlert"("tripId");

ALTER TABLE "ActionAlert" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "ActionAlert" FOR SELECT USING ((SELECT "app_is_system"()));
CREATE POLICY "tenant_insert" ON "ActionAlert" FOR INSERT WITH CHECK ((SELECT "app_is_system"()));
CREATE POLICY "tenant_delete" ON "ActionAlert" FOR DELETE USING ((SELECT "app_is_system"()));
