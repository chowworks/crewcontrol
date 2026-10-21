-- Rooms on a trip, for room-based pricing and room choice.
-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "beds" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_tripId_idx" ON "Room"("tripId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

