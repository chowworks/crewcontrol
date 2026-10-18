-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "organizerName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costPerPersonCents" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "galleryTitle" TEXT NOT NULL DEFAULT 'Photos',
    "showGuestNames" BOOLEAN NOT NULL DEFAULT false,
    "paymentInstructions" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "keyDates" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'interested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");

-- CreateIndex
CREATE INDEX "Guest_tripId_idx" ON "Guest"("tripId");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guests are only ever interested or approved (packages/types GuestStatus).
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_status_check" CHECK ("status" IN ('interested', 'approved'));
