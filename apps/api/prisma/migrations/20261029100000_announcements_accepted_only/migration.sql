-- Announcements reach accepted guests only (owner's decision, 2026-10-29): a guest who signed but isn't accepted yet
-- sees none, and a post "for everyone" means everyone on the trip. Posts made for 'joined' become 'accepted'.
SET lock_timeout = '10s';

UPDATE "Announcement" SET "audience" = 'accepted' WHERE "audience" = 'joined';
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_audience_check";
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_audience_check" CHECK ("audience" IN ('accepted', 'owing'));

-- A guest reads a post while accepted on its trip: any post for everyone on it, and one for those who owed only if
-- it went to them.
DROP POLICY "tenant_read" ON "Announcement";
CREATE POLICY "tenant_read" ON "Announcement" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR ("app_on_trip"("tripId", true)
             AND ("audience" = 'accepted'
                  OR EXISTS (SELECT 1 FROM "AnnouncementRecipient" r
                              WHERE r."announcementId" = "Announcement"."id"
                                AND r."guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[])))));
