-- Trip size limit and the pay-first sign-up option, with payment times on guests.
-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "paymentSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "maxGuests" INTEGER,
ADD COLUMN     "payFirst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refundPledge" BOOLEAN NOT NULL DEFAULT false;

