-- Refund policies (owner's decision, 2026-10-26): an organizer picks how refunds work when a guest drops out, from
-- presets CrewControl writes, never free text, so every version of the agreement is one written sentence. Organizers
-- can ask for other terms; their requests are kept for the CrewControl team (OrganizerRequest).
SET lock_timeout = '10s';

-- 'spot_filled': money comes back only if the organizer fills the spot, as much as the new guest pays (the wording so
-- far). 'first_payment_kept': the first payment isn't refunded; later payments follow 'spot_filled'.
ALTER TABLE "Trip" ADD COLUMN "refundPolicy" TEXT NOT NULL DEFAULT 'spot_filled';
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_refundPolicy_check"
  CHECK ("refundPolicy" IN ('spot_filled', 'first_payment_kept'));

-- What organizers ask CrewControl for that it doesn't do yet (for now, other refund terms), in their words. Anyone
-- signed in adds their own; only the platform admin reads them. Nobody changes or deletes one.
CREATE TABLE "OrganizerRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- The trip they were setting up, if any (no tie to it: the request outlives the trip).
    "tripId" TEXT,
    "tripName" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrganizerRequest_kind_check" CHECK ("kind" IN ('refund_terms')),
    CONSTRAINT "OrganizerRequest_text_check" CHECK (length("text") BETWEEN 1 AND 2000)
);
CREATE INDEX "OrganizerRequest_createdAt_idx" ON "OrganizerRequest"("createdAt");

ALTER TABLE "OrganizerRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "OrganizerRequest" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "OrganizerRequest" FOR INSERT
  WITH CHECK ("userId" = (SELECT "app_user_id"()));
