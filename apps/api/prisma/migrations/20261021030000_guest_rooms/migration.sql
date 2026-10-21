-- Guests' room choices and who they'd share with.
-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "roomNote" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

