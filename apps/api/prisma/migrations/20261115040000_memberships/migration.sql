-- Paid features (issue #90, owner's decisions 2026-11-15): the admin gives a person paid features by email, with an
-- optional last day and a note of what they paid and how. Travel HQ takes no payment; this only records who has what.
-- Not trip data, so no tripId. Only the admin reads and changes them; trusted work reads a person's own when they sign
-- in and marks which features they were shown. Adds a table and a column; changes no existing row.
SET lock_timeout = '10s';

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    -- Stored lowercased, so one person is one row.
    "email" TEXT NOT NULL,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- The last day the features are on; null for no end.
    "endsOn" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "introsSeen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Membership_email_check" CHECK (length("email") BETWEEN 3 AND 254 AND "email" = lower("email")),
    -- A new paid feature adds its key here and to PAID_FEATURES (packages/types).
    CONSTRAINT "Membership_features_check" CHECK ("features" <@ ARRAY['organizer_link', 'custom_domain']::TEXT[]),
    CONSTRAINT "Membership_note_check" CHECK (length("note") <= 2000)
);
CREATE UNIQUE INDEX "Membership_email_key" ON "Membership"("email");

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "Membership" FOR SELECT
  USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_insert" ON "Membership" FOR INSERT WITH CHECK ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_update" ON "Membership" FOR UPDATE
  USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()))
  WITH CHECK ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_delete" ON "Membership" FOR DELETE USING ((SELECT "app_is_admin"()));

-- Organizers ask to try a paid feature they don't have, from the Paid features page; the admin reads it in Review
-- Customer Requests. Their words are optional for this kind.
ALTER TABLE "OrganizerRequest" ADD COLUMN "feature" TEXT;
ALTER TABLE "OrganizerRequest" DROP CONSTRAINT "OrganizerRequest_kind_check";
ALTER TABLE "OrganizerRequest" ADD CONSTRAINT "OrganizerRequest_kind_check"
  CHECK ("kind" IN ('refund_terms', 'feature_access'));
ALTER TABLE "OrganizerRequest" ADD CONSTRAINT "OrganizerRequest_feature_check"
  CHECK (("kind" = 'feature_access') = ("feature" IS NOT NULL)
    AND ("feature" IS NULL OR "feature" IN ('organizer_link', 'custom_domain')));
ALTER TABLE "OrganizerRequest" DROP CONSTRAINT "OrganizerRequest_text_check";
ALTER TABLE "OrganizerRequest" ADD CONSTRAINT "OrganizerRequest_text_check"
  CHECK (length("text") <= 2000 AND ("kind" = 'feature_access' OR length("text") >= 1));

-- Trusted work reads a person's own asks, so asking twice for the same feature emails support once.
DROP POLICY "tenant_read" ON "OrganizerRequest";
CREATE POLICY "tenant_read" ON "OrganizerRequest" FOR SELECT
  USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
