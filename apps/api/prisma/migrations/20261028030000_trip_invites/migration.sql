-- Invites (owner's decision, 2026-10-28): a trip's owners (or the admin) add someone to run the trip by email before
-- that person has ever signed in. The invite waits here; when someone signs in with that email, verified by the
-- sign-in provider, trusted work (runAsSystem) turns it into their TripMember row and deletes it. Emails are kept
-- lowercased, one invite per email per trip.
SET lock_timeout = '10s';

CREATE TABLE "TripInvite" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripInvite_role_check" CHECK ("role" IN ('owner', 'organizer')),
    CONSTRAINT "TripInvite_email_check" CHECK ("email" = lower("email") AND "email" LIKE '%@%')
);
CREATE UNIQUE INDEX "TripInvite_tripId_email_key" ON "TripInvite"("tripId", "email");
CREATE INDEX "TripInvite_email_idx" ON "TripInvite"("email");
ALTER TABLE "TripInvite" ADD CONSTRAINT "TripInvite_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "TripInvite_3_keep" BEFORE UPDATE ON "TripInvite"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId', 'email');

-- Like TripMember: the trip's members read its invites; its owners and the admin give, change and take them back;
-- trusted work reads and deletes them when it turns one into a membership.
ALTER TABLE "TripInvite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripInvite" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripInvite" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_update" ON "TripInvite" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()))
  WITH CHECK ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()));
CREATE POLICY "tenant_delete" ON "TripInvite" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_owned_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()) OR (SELECT "app_is_system"()));
