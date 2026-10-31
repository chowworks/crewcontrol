-- The limited preview as a switch in System Settings (owner's decision, 2026-10-31): on, only admins and people the
-- admin approved for early access start trips, and organizers can refer people (issue #39). Off, anyone signed in
-- starts trips and referrals are hidden. On by default, as Travel HQ is today. The existing policies cover it.
SET lock_timeout = '10s';

ALTER TABLE "SystemSettings" ADD COLUMN "limitedPreview" BOOLEAN NOT NULL DEFAULT true;
