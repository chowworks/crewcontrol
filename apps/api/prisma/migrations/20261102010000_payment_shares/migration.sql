-- A custom payment plan (issue #65): each installment's share of the price, or null for an even split or a deposit.
ALTER TABLE "Trip" ADD COLUMN "paymentShares" JSONB;
