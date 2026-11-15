-- Trip change requests (issue #82; owner's decisions, 2026-11-15): an accepted guest asks the organizers for a change
-- to their trip in their own words. Always private, never on the trip page. Each open one is one of Trip Control's
-- Actions; organizers keep notes on it that the guest never sees, and close it as done or not possible with a message
-- to the guest. New tables only; no data is changed.
SET lock_timeout = '10s';

-- Who asked (as they were when they asked: the email the closing message goes to) and the guest row it's about: their
-- own place, or a traveler they look after.
CREATE TABLE "TripChangeRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT,
    "request" TEXT NOT NULL,
    -- 'open' until an organizer closes it as 'done' or 'declined' (not possible), with a message to the guest.
    "status" TEXT NOT NULL DEFAULT 'open',
    "reply" TEXT,
    "closedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TripChangeRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripChangeRequest_status_check" CHECK ("status" IN ('open', 'done', 'declined')),
    CONSTRAINT "TripChangeRequest_request_check" CHECK (length("request") BETWEEN 1 AND 1000),
    CONSTRAINT "TripChangeRequest_reply_check" CHECK ("reply" IS NULL OR length("reply") BETWEEN 1 AND 2000),
    -- Open means not closed; a closed one has its time. Saying why it's not possible is required.
    CONSTRAINT "TripChangeRequest_closed_check" CHECK (("status" = 'open') = ("closedAt" IS NULL)),
    CONSTRAINT "TripChangeRequest_declined_check" CHECK ("status" <> 'declined' OR "reply" IS NOT NULL)
);
CREATE UNIQUE INDEX "TripChangeRequest_id_tripId_key" ON "TripChangeRequest"("id", "tripId");
CREATE INDEX "TripChangeRequest_tripId_idx" ON "TripChangeRequest"("tripId");
CREATE INDEX "TripChangeRequest_userId_idx" ON "TripChangeRequest"("userId");
ALTER TABLE "TripChangeRequest" ADD CONSTRAINT "TripChangeRequest_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripChangeRequest" ADD CONSTRAINT "TripChangeRequest_guestId_tripId_fkey"
  FOREIGN KEY ("guestId", "tripId") REFERENCES "Guest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The organizers' notes on a request, to track it happening. Never shown to the guest. Kept, never edited.
CREATE TABLE "TripChangeNote" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripChangeNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripChangeNote_text_check" CHECK (length("text") BETWEEN 1 AND 2000)
);
CREATE INDEX "TripChangeNote_requestId_idx" ON "TripChangeNote"("requestId");
CREATE INDEX "TripChangeNote_tripId_idx" ON "TripChangeNote"("tripId");
ALTER TABLE "TripChangeNote" ADD CONSTRAINT "TripChangeNote_requestId_tripId_fkey"
  FOREIGN KEY ("requestId", "tripId") REFERENCES "TripChangeRequest"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The trip's members read and close every request on it. A guest reads the ones they asked, and asks as themselves,
-- open and unanswered, about one of their own guest rows that is accepted.
ALTER TABLE "TripChangeRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripChangeRequest" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "admin_read" ON "TripChangeRequest" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripChangeRequest" FOR INSERT
  WITH CHECK ("userId" = (SELECT "app_user_id"()) AND "status" = 'open' AND "reply" IS NULL
              AND "closedAt" IS NULL
              AND "guestId" = ANY ((SELECT "app_guest_ids"())::TEXT[])
              AND EXISTS (SELECT 1 FROM "Guest" g
                           WHERE g."id" = "TripChangeRequest"."guestId" AND g."status" = 'approved'));
CREATE POLICY "tenant_update" ON "TripChangeRequest" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- Notes are the trip's members' only: a guest never reads one, even on their own request.
ALTER TABLE "TripChangeNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripChangeNote" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "TripChangeNote" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripChangeNote" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) AND "authorUserId" = (SELECT "app_user_id"()));
