-- Vendor payment reminders (issue #116): the due date each unpaid expense's organizers were last emailed about, a
-- week before and on the day, so each goes once; a new due date asks again. Expense's policies already cover these.
ALTER TABLE "Expense" ADD COLUMN "remindedEarlyFor" TEXT;
ALTER TABLE "Expense" ADD COLUMN "remindedDueFor" TEXT;
