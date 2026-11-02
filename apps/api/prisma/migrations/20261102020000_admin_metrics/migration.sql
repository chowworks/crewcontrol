-- The Admin toolbox's Metrics page: how many people use Travel HQ, how many trips they made and how many payments
-- they tracked. Counts and totals only, and only for the admin: the admin's mark reaches no guest, payment or terms
-- row, so the numbers come from here, as admin_trip_counts does. Sample trips are left out. A deleted trip still
-- counts until it is erased (30 days later).
--   users:    people who accepted the Terms of Use (they joined a trip or opened organizer screens), by first acceptance
--   trips:    trips created, by createdAt
--   payments: payments an organizer confirmed, by when they confirmed them, and what arrived; waiting: reported, not
--             yet confirmed. Refunded payments are not counted.
CREATE FUNCTION "admin_metrics"()
RETURNS TABLE (
  "users" INTEGER, "usersRecent" INTEGER,
  "trips" INTEGER, "tripsRecent" INTEGER,
  "payments" INTEGER, "paymentsRecent" INTEGER,
  "paymentCents" BIGINT, "paymentCentsRecent" BIGINT,
  "paymentsWaiting" INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH since AS (SELECT CURRENT_TIMESTAMP - INTERVAL '30 days' AS t),
  people AS (SELECT "userId", MIN("acceptedAt") AS first FROM "TermsAcceptance" GROUP BY "userId"),
  pay AS (
    SELECT p."status", p."decidedAt", p."receivedPaymentAmount" AS cents
      FROM "Payment" p JOIN "Trip" t ON t."id" = p."tripId"
     WHERE NOT t."isSample"
  )
  SELECT (SELECT COUNT(*) FROM people)::INTEGER,
         (SELECT COUNT(*) FROM people, since WHERE people.first >= since.t)::INTEGER,
         (SELECT COUNT(*) FROM "Trip" WHERE NOT "isSample")::INTEGER,
         (SELECT COUNT(*) FROM "Trip", since WHERE NOT "isSample" AND "createdAt" >= since.t)::INTEGER,
         (SELECT COUNT(*) FROM pay WHERE "status" = 'confirmed')::INTEGER,
         (SELECT COUNT(*) FROM pay, since WHERE "status" = 'confirmed' AND "decidedAt" >= since.t)::INTEGER,
         (SELECT COALESCE(SUM(cents), 0) FROM pay WHERE "status" = 'confirmed')::BIGINT,
         (SELECT COALESCE(SUM(cents), 0) FROM pay, since WHERE "status" = 'confirmed' AND "decidedAt" >= since.t)::BIGINT,
         (SELECT COUNT(*) FROM pay WHERE "status" = 'reported')::INTEGER
   WHERE "app_is_admin"()
$$;
REVOKE ALL ON FUNCTION "admin_metrics"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cc_app') THEN
    GRANT EXECUTE ON FUNCTION "admin_metrics"() TO cc_app;
  END IF;
END $$;
