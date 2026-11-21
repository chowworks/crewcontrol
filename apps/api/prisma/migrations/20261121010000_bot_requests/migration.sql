-- Bot requests, for the Admin toolbox's Track Metrics page (src/core/bot-request-log.ts): requests the API turned
-- away before they reached any route, such as a scanner asking for /.env or /wp-login.php, or a body it can't read.
-- The API counts them in memory and writes one row every 15 minutes when there were any, so a scan of thousands of
-- requests a minute costs one write, not thousands.
--
-- A row is when, how many, and the most asked-for paths in that time (method and path, no query string), nothing
-- else: no address, no person, no trip. So it is not a tenant table: no tripId, no policies, and the restricted role
-- reads, inserts and deletes it with the table grants (the API deletes rows older than 30 days).
SET lock_timeout = '10s';

CREATE TABLE "BotRequestTally" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL,
    -- [{ "path": "GET /.env", "count": 3 }, ...], the top 20 of that time, most first
    "paths" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "BotRequestTally_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BotRequestTally_count_check" CHECK ("count" > 0)
);
CREATE INDEX "BotRequestTally_at_idx" ON "BotRequestTally"("at");
