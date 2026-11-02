-- Two more numbers on the Admin toolbox's Metrics page (same rules as 20261102020000_admin_metrics):
--   liveTrips: trips that are published, not deleted, and have at least one accepted guest (real trips, not drafts)
--   loggedBy*: every payment on a real trip by who put it in: the guest, the organizer, or a forwarded receipt.
-- The result's columns change, so the function is dropped and made again.
DROP FUNCTION "admin_metrics"();
CREATE FUNCTION "admin_metrics"()
RETURNS TABLE (
  "users" INTEGER, "usersRecent" INTEGER,
  "trips" INTEGER, "tripsRecent" INTEGER,
  "liveTrips" INTEGER,
  "payments" INTEGER, "paymentsRecent" INTEGER,
  "paymentCents" BIGINT, "paymentCentsRecent" BIGINT,
  "paymentsWaiting" INTEGER,
  "loggedByGuest" INTEGER, "loggedByOrganizer" INTEGER, "loggedByEmail" INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH since AS (SELECT CURRENT_TIMESTAMP - INTERVAL '30 days' AS t),
  people AS (SELECT "userId", MIN("acceptedAt") AS first FROM "TermsAcceptance" GROUP BY "userId"),
  pay AS (
    SELECT p."status", p."decidedAt", p."receivedPaymentAmount" AS cents, p."loggedBy"
      FROM "Payment" p JOIN "Trip" t ON t."id" = p."tripId"
     WHERE NOT t."isSample"
  )
  SELECT (SELECT COUNT(*) FROM people)::INTEGER,
         (SELECT COUNT(*) FROM people, since WHERE people.first >= since.t)::INTEGER,
         (SELECT COUNT(*) FROM "Trip" WHERE NOT "isSample")::INTEGER,
         (SELECT COUNT(*) FROM "Trip", since WHERE NOT "isSample" AND "createdAt" >= since.t)::INTEGER,
         (SELECT COUNT(*) FROM "Trip" t
           WHERE NOT t."isSample" AND t."published" AND t."deletedAt" IS NULL
             AND EXISTS (SELECT 1 FROM "Guest" g WHERE g."tripId" = t."id" AND g."status" = 'approved'))::INTEGER,
         (SELECT COUNT(*) FROM pay WHERE "status" = 'confirmed')::INTEGER,
         (SELECT COUNT(*) FROM pay, since WHERE "status" = 'confirmed' AND "decidedAt" >= since.t)::INTEGER,
         (SELECT COALESCE(SUM(cents), 0) FROM pay WHERE "status" = 'confirmed')::BIGINT,
         (SELECT COALESCE(SUM(cents), 0) FROM pay, since WHERE "status" = 'confirmed' AND "decidedAt" >= since.t)::BIGINT,
         (SELECT COUNT(*) FROM pay WHERE "status" = 'reported')::INTEGER,
         (SELECT COUNT(*) FROM pay WHERE "loggedBy" = 'guest')::INTEGER,
         (SELECT COUNT(*) FROM pay WHERE "loggedBy" = 'organizer')::INTEGER,
         (SELECT COUNT(*) FROM pay WHERE "loggedBy" = 'email')::INTEGER
   WHERE "app_is_admin"()
$$;
REVOKE ALL ON FUNCTION "admin_metrics"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "admin_metrics"() TO cc_app;
  END IF;
END $$;
