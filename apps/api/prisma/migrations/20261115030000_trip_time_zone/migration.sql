-- The trip's own clock (issue #88): sign-ups close at midnight there on the first day. Existing trips count on
-- New York time until the organizer picks another. Adds a column only.
SET lock_timeout = '10s';

ALTER TABLE "Trip" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/New_York';
