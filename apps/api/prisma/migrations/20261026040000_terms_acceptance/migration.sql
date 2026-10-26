-- CrewControl's own Terms (src/terms/terms-text.ts): everyone accepts the Terms of Use ('use'), and anyone who runs a
-- trip the Organizer Terms ('organizer') as well, at first and again whenever their wording changes. "fingerprint" is
-- the version: 16 hex characters of the hash of the wording. One row per person per document per version, kept as proof
-- of what was accepted, when, and from which address and browser.
--
-- No foreign key and no tripId on purpose: acceptance belongs to the person, not to a trip, and outlives any guest row
-- they had. So there is no set_tenant trigger and no trip policy.
SET lock_timeout = '10s';

CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TermsAcceptance_kind_check" CHECK ("kind" IN ('use', 'organizer'))
);
CREATE UNIQUE INDEX "TermsAcceptance_userId_kind_fingerprint_key" ON "TermsAcceptance"("userId", "kind", "fingerprint");

-- An acceptance carries the database's time, not one the writer chose.
CREATE FUNCTION "terms_accepted_now"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."acceptedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;
CREATE TRIGGER "TermsAcceptance_2_stamp_now" BEFORE INSERT ON "TermsAcceptance"
  FOR EACH ROW EXECUTE FUNCTION "terms_accepted_now"();
REVOKE ALL ON FUNCTION "terms_accepted_now"() FROM PUBLIC;

-- Append-only: a person reads and adds only their own rows. There is no update or delete policy, so the restricted
-- role can do neither, not even as trusted work.
ALTER TABLE "TermsAcceptance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "TermsAcceptance" FOR SELECT
  USING ("userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "TermsAcceptance" FOR INSERT
  WITH CHECK ("userId" = (SELECT "app_user_id"()));
