-- Announcements emailed to a trip's Interested list (issue #77; owner's decisions, 2026-11-14): optional per post,
-- email only, no replies. Each person on the list gets their own "Stop updates for this trip" link, as guests have.
-- Adds columns; no data is changed.
SET lock_timeout = '10s';

-- The secret in their stop link, and when they used it.
ALTER TABLE "TripInterest" ADD COLUMN "updatesToken" TEXT NOT NULL DEFAULT (gen_random_uuid())::text;
ALTER TABLE "TripInterest" ADD COLUMN "updatesStoppedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "TripInterest_updatesToken_key" ON "TripInterest"("updatesToken");

-- How many people on the Interested list a post was emailed to (0 when the organizer didn't tick it).
ALTER TABLE "Announcement" ADD COLUMN "interestedEmailedTo" INTEGER NOT NULL DEFAULT 0;
