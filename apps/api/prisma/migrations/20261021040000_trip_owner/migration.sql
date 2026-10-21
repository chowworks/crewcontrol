-- Trips belong to the Clerk user who made them.
-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Trip_ownerId_idx" ON "Trip"("ownerId");

