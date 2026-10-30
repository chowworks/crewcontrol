-- Announcements (issue #12): the organizers post to the guests who joined (everyone, accepted guests only, or those
-- who still owe), the post can go out by email too, and the guests it went to reply under it (owner's decision,
-- 2026-10-29: replies under each post, not one open chat). It is what replaces the group chat.
SET lock_timeout = '10s';

-- ── Posts ────────────────────────────────────────────────────────────────────
-- Who wrote it is kept as their name then, so a post reads the same after someone leaves the trip.
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- 'joined': every guest not turned down; 'accepted': accepted guests; 'owing': the guests who owed when it went.
    "audience" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Announcement_audience_check" CHECK ("audience" IN ('joined', 'accepted', 'owing')),
    CONSTRAINT "Announcement_body_check" CHECK (length("body") BETWEEN 1 AND 4000)
);
CREATE UNIQUE INDEX "Announcement_id_tripId_key" ON "Announcement"("id", "tripId");
CREATE INDEX "Announcement_tripId_idx" ON "Announcement"("tripId");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Who it went to ───────────────────────────────────────────────────────────
-- The guests a post was for when it went, and when its email went to each (null: not emailed, or they stopped
-- updates). A post for those who owe stays with them; one for everyone or the accepted also reaches who joins later.
CREATE TABLE "AnnouncementRecipient" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "announcementId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnnouncementRecipient_announcementId_guestId_key" ON "AnnouncementRecipient"("announcementId", "guestId");
CREATE INDEX "AnnouncementRecipient_tripId_idx" ON "AnnouncementRecipient"("tripId");
CREATE INDEX "AnnouncementRecipient_guestId_idx" ON "AnnouncementRecipient"("guestId");
ALTER TABLE "AnnouncementRecipient" ADD CONSTRAINT "AnnouncementRecipient_announcementId_tripId_fkey"
  FOREIGN KEY ("announcementId", "tripId") REFERENCES "Announcement"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRecipient" ADD CONSTRAINT "AnnouncementRecipient_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Replies ──────────────────────────────────────────────────────────────────
-- A guest's reply names their guest row; an organizer's has none. The name is kept as it showed ("Monique H.").
CREATE TABLE "AnnouncementReply" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "announcementId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementReply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnnouncementReply_body_check" CHECK (length("body") BETWEEN 1 AND 2000)
);
CREATE INDEX "AnnouncementReply_announcementId_idx" ON "AnnouncementReply"("announcementId");
CREATE INDEX "AnnouncementReply_tripId_idx" ON "AnnouncementReply"("tripId");
ALTER TABLE "AnnouncementReply" ADD CONSTRAINT "AnnouncementReply_announcementId_tripId_fkey"
  FOREIGN KEY ("announcementId", "tripId") REFERENCES "Announcement"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReply" ADD CONSTRAINT "AnnouncementReply_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Who reads what ───────────────────────────────────────────────────────────
-- Whether the caller is on a trip as a guest (their own row or one they look after), not turned down, and with
-- `accepted`, accepted. Yes or no only.
CREATE FUNCTION "app_on_trip"(trip TEXT, accepted BOOLEAN) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "Guest"
                  WHERE "id" = ANY ("app_guest_ids"()) AND "tripId" = trip
                    AND "status" <> 'declined' AND (NOT accepted OR "status" = 'approved'))
$$;

-- The trip's members write and remove posts; a guest reads one that was for them, or one for everyone (or the
-- accepted) on a trip they're on (or accepted on) now.
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "Announcement" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR ("audience" = 'joined' AND "app_on_trip"("tripId", false))
         OR ("audience" = 'accepted' AND "app_on_trip"("tripId", true))
         OR EXISTS (SELECT 1 FROM "AnnouncementRecipient" r
                     WHERE r."announcementId" = "Announcement"."id"
                       AND r."guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[])));
CREATE POLICY "admin_read" ON "Announcement" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "Announcement" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "authorUserId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "Announcement" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "Announcement" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- Written with the post by its author; a guest reads only their own lines.
ALTER TABLE "AnnouncementRecipient" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "AnnouncementRecipient" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "AnnouncementRecipient" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "AnnouncementRecipient" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "AnnouncementRecipient" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- Replies are read by whoever can read the post. A member replies as themselves; a guest as one of their own rows,
-- under a post they can read. The trip's members remove any reply, and its author their own.
ALTER TABLE "AnnouncementReply" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "AnnouncementReply" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR EXISTS (SELECT 1 FROM "Announcement" a WHERE a."id" = "AnnouncementReply"."announcementId"));
CREATE POLICY "admin_read" ON "AnnouncementReply" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "AnnouncementReply" FOR INSERT
  WITH CHECK ("authorUserId" = (SELECT "app_user_id"())
              AND (("guestId" IS NULL AND "tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
                   OR ("guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[])
                       AND EXISTS (SELECT 1 FROM "Announcement" a WHERE a."id" = "AnnouncementReply"."announcementId"))));
CREATE POLICY "tenant_delete" ON "AnnouncementReply" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "authorUserId" = (SELECT "app_user_id"()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "app_on_trip"(TEXT, BOOLEAN) TO cc_app;
  END IF;
END $$;
