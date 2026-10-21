-- Bed types and a minimum number of people per room.
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "bedTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "minPeople" INTEGER NOT NULL DEFAULT 1;

