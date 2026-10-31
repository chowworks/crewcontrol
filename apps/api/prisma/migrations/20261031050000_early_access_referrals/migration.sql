-- Referrals while Travel HQ is a limited preview (issue #39, kept light): someone who runs a trip refers a person,
-- which is an early access request tagged with who referred them. The admin approves a request, referred or not, and
-- whoever signs in with that email may then start trips. The admin changes a request (approving or undoing it);
-- trusted work in the API (runAsSystem) reads one to check the caller's approval and tags one with its referrer.
SET lock_timeout = '10s';

ALTER TABLE "EarlyAccessRequest"
    ADD COLUMN "referredByUserId" TEXT,
    ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE POLICY "system_read" ON "EarlyAccessRequest" FOR SELECT USING ((SELECT "app_is_system"()));
CREATE POLICY "admin_update" ON "EarlyAccessRequest" FOR UPDATE
    USING ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()))
    WITH CHECK ((SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
