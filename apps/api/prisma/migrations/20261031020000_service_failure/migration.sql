-- Failures people hit through no fault of their own, counted by the public health check /api/health/server-errors
-- (src/core/service-failure-log.ts) and watched by Better Stack (ops/monitoring.ts). Kept in a table, not in memory,
-- so a deploy or a second instance does not hide them. Copied from Audit Differently.
--
-- A row names when it happened, which kind it was and the route it happened on (`POST /api/join/:slug`, the route's
-- pattern, never its ids), and nothing else: no trip, no person, no email, no error message. The reason goes to the
-- API's log only. So it is not a tenant table: no tripId, no policies, and the restricted role reads, inserts and
-- deletes it with the table grants (the API deletes rows older than 30 days).
SET lock_timeout = '10s';

CREATE TABLE "ServiceFailure" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,

    CONSTRAINT "ServiceFailure_pkey" PRIMARY KEY ("id"),
    -- server: any request answered 5xx
    CONSTRAINT "ServiceFailure_kind_check" CHECK ("kind" IN ('server')),
    -- a method and a route pattern; the bound keeps a row small whatever the router hands over
    CONSTRAINT "ServiceFailure_route_check" CHECK (char_length("route") <= 200)
);
CREATE INDEX "ServiceFailure_kind_at_idx" ON "ServiceFailure"("kind", "at");
