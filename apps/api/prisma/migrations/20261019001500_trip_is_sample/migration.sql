-- Marks the seed's demo trips. The homepage lists only these.
ALTER TABLE "Trip" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
