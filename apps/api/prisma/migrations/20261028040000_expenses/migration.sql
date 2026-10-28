-- Vendor expenses (issue #16): what the organizer pays out for the trip (the house, the resort, a chef), so Trip
-- Financials can show what's left after costs. Recorded only; Travel HQ never moves money. An expense is paid once it
-- has a paid date and still owed until then, by its due date if it has one. Only the trip's members see or change
-- them; guests and the public page never do.
SET lock_timeout = '10s';

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    -- Whole cents.
    "amountCents" INTEGER NOT NULL,
    -- 'YYYY-MM-DD'.
    "paidOn" TEXT,
    "dueOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_amount_check" CHECK ("amountCents" > 0),
    CONSTRAINT "Expense_payee_check" CHECK (length(trim("payee")) > 0)
);
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "Expense_3_keep" BEFORE UPDATE ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId');

-- The trip's members read, add, change and remove its expenses; the admin reads them, as it reads payments.
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "Expense" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "Expense" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "Expense" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "Expense" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "Expense" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
