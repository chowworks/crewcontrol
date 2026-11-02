-- Organizer help (issue #66, owner's decisions 2026-11-01): Travel HQ's own answers behind the Help button on every
-- organizer page, and the questions organizers ask us when the answer isn't there. Not trip data, so no tripId
-- policies: like EmailTemplate, the default answers live in the code (src/help/help-defaults.ts) and a HelpEntry row
-- is the admin's version of one, or an answer the admin added.
SET lock_timeout = '10s';

CREATE TABLE "HelpEntry" (
    -- A default's key, or a new one for an answer the admin added.
    "key" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "pages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    -- The fingerprint of the default this row replaces, when it was saved; null for an answer the admin added. When the
    -- default in the code changes, the two differ and the Help page asks the admin to look again.
    "defaultHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,

    CONSTRAINT "HelpEntry_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "HelpEntry_key_check" CHECK ("key" ~ '^[a-z0-9-]{1,80}$'),
    CONSTRAINT "HelpEntry_topic_check" CHECK ("topic" IN ('start', 'signups', 'payments', 'tripPage', 'questions')),
    CONSTRAINT "HelpEntry_question_check" CHECK (length("question") BETWEEN 1 AND 300),
    CONSTRAINT "HelpEntry_answer_check" CHECK (length("answer") BETWEEN 1 AND 4000)
);

-- Every signed-in organizer reads them; only the admin writes them.
ALTER TABLE "HelpEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "HelpEntry" FOR SELECT USING (true);
CREATE POLICY "tenant_insert" ON "HelpEntry" FOR INSERT WITH CHECK ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_update" ON "HelpEntry" FOR UPDATE
  USING ((SELECT "app_is_admin"())) WITH CHECK ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_delete" ON "HelpEntry" FOR DELETE USING ((SELECT "app_is_admin"()));

-- A question an organizer asked from the Help panel, in their words, with the page they were on and the trip's name
-- (no tie to the trip: the question outlives it). The admin answers it in the Admin toolbox, and the answer is
-- emailed to them. Nobody deletes one.
CREATE TABLE "HelpQuestion" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "tripId" TEXT,
    "tripName" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HelpQuestion_question_check" CHECK (length("question") BETWEEN 1 AND 2000),
    CONSTRAINT "HelpQuestion_answer_check" CHECK ("answer" IS NULL OR length("answer") BETWEEN 1 AND 4000)
);
CREATE INDEX "HelpQuestion_createdAt_idx" ON "HelpQuestion"("createdAt");

-- Anyone signed in adds their own; only the admin reads and answers them.
ALTER TABLE "HelpQuestion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "HelpQuestion" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "HelpQuestion" FOR INSERT
  WITH CHECK ("userId" = (SELECT "app_user_id"()) AND "answer" IS NULL AND "answeredAt" IS NULL);
CREATE POLICY "tenant_update" ON "HelpQuestion" FOR UPDATE
  USING ((SELECT "app_is_admin"())) WITH CHECK ((SELECT "app_is_admin"()));
