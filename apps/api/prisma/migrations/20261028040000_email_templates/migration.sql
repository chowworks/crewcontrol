-- Email templates (owner's decision, 2026-10-28): the admin edits the emails Travel HQ sends, in the Admin toolbox
-- ("Emails"), as HTML with variables (src/messaging/email-template.ts). The wording each email starts with lives in
-- the code (src/messaging/email-defaults.ts); a row here is the admin's version of one email, and deleting it goes
-- back to the default. Not trip data: one row per kind of email.
SET lock_timeout = '10s';

CREATE TABLE "EmailTemplate" (
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("kind"),
    CONSTRAINT "EmailTemplate_subject_check" CHECK (length("subject") BETWEEN 1 AND 200),
    CONSTRAINT "EmailTemplate_body_check" CHECK (length("body") BETWEEN 1 AND 50000)
);

-- Everyone reads them (any join may send one); only the admin writes them. Listed with the tables that carry
-- policies (src/core/tenant-tables.ts) so the admin's mark is set when it writes.
ALTER TABLE "EmailTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "EmailTemplate" FOR SELECT USING (true);
CREATE POLICY "tenant_insert" ON "EmailTemplate" FOR INSERT WITH CHECK ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_update" ON "EmailTemplate" FOR UPDATE
  USING ((SELECT "app_is_admin"())) WITH CHECK ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_delete" ON "EmailTemplate" FOR DELETE USING ((SELECT "app_is_admin"()));
