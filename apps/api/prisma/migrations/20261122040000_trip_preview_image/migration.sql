-- The trip's link preview picture, drawn when the trip is saved (trip-preview.ts): a photo reference in the bucket,
-- or the seed's /seed/ path. Null until then; the preview falls back to the cover photo.
ALTER TABLE "Trip" ADD COLUMN "previewImage" TEXT;
