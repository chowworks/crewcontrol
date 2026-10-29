-- Email problems (owner's decision, 2026-10-29): when an email bounces, is blocked because its address bounced
-- before, or is marked as spam, Resend tells the API (a webhook). Each notice is kept in EmailProblem for the Admin
-- toolbox, and every guest with that address gets the problem, so Trip Control's Actions asks the organizer to fix
-- it. Resend already stops sending to that address itself; this is only so someone on our side knows.
SET lock_timeout = '10s';

ALTER TABLE "Guest" ADD COLUMN "emailProblem" TEXT;
ALTER TABLE "Guest" ADD COLUMN "emailProblemAt" TIMESTAMP(3);
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_emailProblem_check"
  CHECK ("emailProblem" IN ('bounced', 'complained'));

-- Not trip data: one row per notice, read by the admin only, written only by note_email_problem.
CREATE TABLE "EmailProblem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "address" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailProblem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailProblem_kind_check" CHECK ("kind" IN ('bounced', 'blocked', 'complained'))
);
CREATE INDEX "EmailProblem_at_idx" ON "EmailProblem"("at");
ALTER TABLE "EmailProblem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "EmailProblem" FOR SELECT USING ((SELECT "app_is_admin"()));

-- Keeps one notice and marks every guest row with its address (any trip). Trusted work only (the webhook, runAsSystem).
-- A blocked send means the address bounced before, so its guests show as bounced.
CREATE FUNCTION "note_email_problem"(address TEXT, problem TEXT, about TEXT, why TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT "app_is_system"() THEN RAISE EXCEPTION 'Trusted work only' USING ERRCODE = '42501'; END IF;
  INSERT INTO "EmailProblem" ("address", "kind", "subject", "detail")
  VALUES (lower(left(address, 254)), problem, left(coalesce(about, ''), 300), left(coalesce(why, ''), 500));
  UPDATE "Guest"
     SET "emailProblem" = CASE WHEN problem = 'complained' THEN 'complained' ELSE 'bounced' END,
         "emailProblemAt" = CURRENT_TIMESTAMP
   WHERE lower("email") = lower(address);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION "note_email_problem"(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- The Admin toolbox's Email problems: each notice, newest first, with the guests on that address now (the admin's mark
-- reads no guest row, so this function does) and whether each one's problem is still open.
CREATE FUNCTION "admin_email_problems"()
RETURNS TABLE ("id" TEXT, "address" TEXT, "kind" TEXT, "subject" TEXT, "detail" TEXT, "at" TIMESTAMP(3), "guests" JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", p."address", p."kind", p."subject", p."detail", p."at",
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'tripId', t."id", 'tripName', t."name",
                    'name', g."firstName" || ' ' || g."lastName", 'open', g."emailProblem" IS NOT NULL))
                     FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
                    WHERE lower(g."email") = p."address"), '[]'::JSONB)
    FROM "EmailProblem" p
   WHERE "app_is_admin"()
   ORDER BY p."at" DESC
   LIMIT 500
$$;
REVOKE ALL ON FUNCTION "admin_email_problems"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "note_email_problem"(TEXT, TEXT, TEXT, TEXT) TO cc_app;
    GRANT EXECUTE ON FUNCTION "admin_email_problems"() TO cc_app;
  END IF;
END $$;
