-- Custom trip sections (issue #85; owner's decisions, 2026-11-15): the organizer's own parts of the trip page, each a
-- title, text, photos and who sees it (TripSection[]). Adds a column; no data is changed.
SET lock_timeout = '10s';

ALTER TABLE "Trip" ADD COLUMN "sections" JSONB NOT NULL DEFAULT '[]';
