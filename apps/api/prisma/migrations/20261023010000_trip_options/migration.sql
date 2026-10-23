-- Trip options (TripOptions in packages/types): settings that only change what the pages show, in one field so a
-- new one needs no database change. A setting the database must enforce gets its own column instead.
ALTER TABLE "Trip" ADD COLUMN "options" JSONB NOT NULL DEFAULT '{}';

-- Trips that already have rooms offered them on the sign-up form, so they keep room choice on.
UPDATE "Trip" t SET "options" = '{"roomChoice": true}'
WHERE EXISTS (SELECT 1 FROM "Room" r WHERE r."tripId" = t.id);
