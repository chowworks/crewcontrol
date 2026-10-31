-- Save the date and the interest list (issue #47; owner's decisions, 2026-10-31). While a trip is a save the date, its
-- page takes "I'm interested" instead of sign-ups; turning it off opens sign-ups, and the organizers can email everyone
-- on the list that they're open. The list is its own table, apart from guests, so being interested never counts as a
-- signature, a balance or a spot.
SET lock_timeout = '10s';

ALTER TABLE "Trip" ADD COLUMN "saveTheDate" BOOLEAN NOT NULL DEFAULT false;

-- A signed-in person, at most once a trip. The email is their sign-in's; the name and phone they gave. Kept as long as
-- the trip (erased with it), until they take themselves off or an organizer removes them.
CREATE TABLE "TripInterest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- When an organizer emailed them that sign-ups are open: each person is told once.
    "toldAt" TIMESTAMP(3),

    CONSTRAINT "TripInterest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripInterest_firstName_check" CHECK (length("firstName") BETWEEN 1 AND 120),
    CONSTRAINT "TripInterest_lastName_check" CHECK (length("lastName") <= 120),
    CONSTRAINT "TripInterest_email_check" CHECK (length("email") BETWEEN 3 AND 254),
    CONSTRAINT "TripInterest_phone_check" CHECK (length("phone") BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX "TripInterest_tripId_userId_key" ON "TripInterest"("tripId", "userId");
CREATE INDEX "TripInterest_userId_idx" ON "TripInterest"("userId");
ALTER TABLE "TripInterest" ADD CONSTRAINT "TripInterest_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The trip's members read, mark and remove everyone on its list. A signed-in person reads their own entry, adds
-- themselves to a published trip (never told yet), and takes themselves off. Nothing on the public page reads it.
ALTER TABLE "TripInterest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripInterest" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "admin_read" ON "TripInterest" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripInterest" FOR INSERT
  WITH CHECK ("userId" = (SELECT "app_user_id"()) AND "toldAt" IS NULL AND "trip_is_published"("tripId"));
CREATE POLICY "tenant_update" ON "TripInterest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "TripInterest" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR "userId" = (SELECT "app_user_id"()));
