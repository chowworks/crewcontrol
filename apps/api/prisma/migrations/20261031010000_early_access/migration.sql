-- A limited preview (owner's decision, 2026-10-30): only admins start trips, and anyone else who wants to run one
-- asks for early access on the public limited preview page, without signing in: a name, an email and an optional
-- note. Not trip data, so no tripId. Anyone may add one (the page is public); only the admin reads them. Nobody
-- changes or deletes one. One per email: asking again keeps the first.
SET lock_timeout = '10s';

CREATE TABLE "EarlyAccessRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "name" TEXT NOT NULL,
    -- Stored lowercased, so one person asking twice is one request.
    "email" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyAccessRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EarlyAccessRequest_name_check" CHECK (length("name") BETWEEN 1 AND 120),
    CONSTRAINT "EarlyAccessRequest_email_check" CHECK (length("email") BETWEEN 3 AND 254 AND "email" = lower("email")),
    CONSTRAINT "EarlyAccessRequest_note_check" CHECK (length("note") <= 2000)
);
CREATE UNIQUE INDEX "EarlyAccessRequest_email_key" ON "EarlyAccessRequest"("email");
CREATE INDEX "EarlyAccessRequest_createdAt_idx" ON "EarlyAccessRequest"("createdAt");

ALTER TABLE "EarlyAccessRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "EarlyAccessRequest" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "public_insert" ON "EarlyAccessRequest" FOR INSERT WITH CHECK (true);
