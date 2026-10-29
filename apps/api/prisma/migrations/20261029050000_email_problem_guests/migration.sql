-- Email problems keep the guests they were about (owner's tour, 2026-10-29): once an organizer fixes a guest's address,
-- the Admin toolbox still shows who the bounce was for, marked fixed, instead of "no guest uses this address".
SET lock_timeout = '10s';

ALTER TABLE "EmailProblem" ADD COLUMN "guestIds" TEXT[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION "note_email_problem"(address TEXT, problem TEXT, about TEXT, why TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  ids TEXT[];
BEGIN
  IF NOT "app_is_system"() THEN RAISE EXCEPTION 'Trusted work only' USING ERRCODE = '42501'; END IF;
  WITH marked AS (
    UPDATE "Guest"
       SET "emailProblem" = CASE WHEN problem = 'complained' THEN 'complained' ELSE 'bounced' END,
           "emailProblemAt" = CURRENT_TIMESTAMP
     WHERE lower("email") = lower(address)
    RETURNING "id"
  )
  SELECT COALESCE(array_agg("id"), '{}') INTO ids FROM marked;
  INSERT INTO "EmailProblem" ("address", "kind", "subject", "detail", "guestIds")
  VALUES (lower(left(address, 254)), problem, left(coalesce(about, ''), 300), left(coalesce(why, ''), 500), ids);
  RETURN cardinality(ids);
END $$;

-- Each notice with the guests it was about. Still open while that guest has a problem and the same address.
CREATE OR REPLACE FUNCTION "admin_email_problems"()
RETURNS TABLE ("id" TEXT, "address" TEXT, "kind" TEXT, "subject" TEXT, "detail" TEXT, "at" TIMESTAMP(3), "guests" JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", p."address", p."kind", p."subject", p."detail", p."at",
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'tripId', t."id", 'tripName', t."name",
                    'name', g."firstName" || ' ' || g."lastName",
                    'open', g."emailProblem" IS NOT NULL AND lower(g."email") = p."address"))
                     FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
                    WHERE g."id" = ANY (p."guestIds")), '[]'::JSONB)
    FROM "EmailProblem" p
   WHERE "app_is_admin"()
   ORDER BY p."at" DESC
   LIMIT 500
$$;
