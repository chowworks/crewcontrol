-- Questions, the trip page's FAQ (issue #13): a signed-in person asks the organizers a question, and an organizer
-- answers it for everyone (it shows on the trip page) or for the asker only, tagged Private. Organizers also add,
-- edit, reorder and delete entries themselves (owner's decisions, 2026-10-28 and 2026-10-30).
SET lock_timeout = '10s';

-- The asker needn't be on the trip: people ask before they join. Their name and email are kept as they were when they
-- asked, for Trip Control and the answer's email, and never reach the trip page. An entry an organizer added has none.
CREATE TABLE "TripQuestion" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "askerUserId" TEXT,
    "askerName" TEXT,
    "askerEmail" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    -- 'waiting' for an answer; answered for everyone ('public') or for the asker only ('private').
    "status" TEXT NOT NULL DEFAULT 'waiting',
    -- The trip page's order of the public entries.
    "position" INTEGER NOT NULL DEFAULT 0,
    "answeredByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "TripQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TripQuestion_status_check" CHECK ("status" IN ('waiting', 'public', 'private')),
    CONSTRAINT "TripQuestion_question_check" CHECK (length("question") BETWEEN 1 AND 500),
    CONSTRAINT "TripQuestion_answer_check" CHECK ("answer" IS NULL OR length("answer") BETWEEN 1 AND 4000),
    -- Waiting means no answer yet; an answered one has one; only a question someone asked can be answered privately.
    CONSTRAINT "TripQuestion_answered_check" CHECK (("status" = 'waiting') = ("answer" IS NULL)),
    CONSTRAINT "TripQuestion_private_check" CHECK ("status" <> 'private' OR "askerUserId" IS NOT NULL),
    CONSTRAINT "TripQuestion_asked_check" CHECK ("status" <> 'waiting' OR "askerUserId" IS NOT NULL)
);
CREATE INDEX "TripQuestion_tripId_idx" ON "TripQuestion"("tripId");
CREATE INDEX "TripQuestion_askerUserId_idx" ON "TripQuestion"("askerUserId");
ALTER TABLE "TripQuestion" ADD CONSTRAINT "TripQuestion_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The trip's members read and change every question on it. A public page reads the answers for everyone on a
-- published trip. A signed-in person reads their own questions, and asks one on a published trip: waiting, unanswered,
-- as themselves.
ALTER TABLE "TripQuestion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TripQuestion" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
         OR "askerUserId" = (SELECT "app_user_id"())
         OR ((SELECT "app_is_public"()) AND "status" = 'public' AND "trip_is_published"("tripId")));
CREATE POLICY "admin_read" ON "TripQuestion" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "TripQuestion" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ("askerUserId" = (SELECT "app_user_id"()) AND "status" = 'waiting' AND "answer" IS NULL
                  AND "trip_is_published"("tripId")));
CREATE POLICY "tenant_update" ON "TripQuestion" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "TripQuestion" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
