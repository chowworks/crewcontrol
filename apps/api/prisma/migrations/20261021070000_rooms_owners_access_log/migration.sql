-- Fits the sign-in and room work to trip isolation (docs/tenant-isolation.md): owners move from Trip.ownerId to
-- TripMember rows, rooms get the same policies as guests, the public pages and the admin get only the counts they
-- may see, and every change the platform admin makes to a trip's people is logged.
SET lock_timeout = '10s';

-- ── Owners: Trip.ownerId becomes an owner TripMember row ─────────────────────
INSERT INTO "TripMember" ("id", "tripId", "userId", "role")
SELECT 'own_' || t."id", t."id", t."ownerId", 'owner'
  FROM "Trip" t
 WHERE t."ownerId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "TripMember" m WHERE m."tripId" = t."id" AND m."userId" = t."ownerId");

DROP INDEX IF EXISTS "Trip_ownerId_idx";
ALTER TABLE "Trip" DROP COLUMN "ownerId";

-- ── Rooms: a trip's rooms are its members' ───────────────────────────────────
-- The public page reads a published trip's rooms (names, beds, places), never who chose them.
CREATE TRIGGER "Room_3_keep" BEFORE UPDATE ON "Room"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId');

ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read" ON "Room" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"())
         OR ((SELECT "app_is_public"())
             AND EXISTS (SELECT 1 FROM "Trip" t WHERE t."id" = "tripId" AND t."published")));
CREATE POLICY "tenant_insert" ON "Room" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()));
CREATE POLICY "tenant_update" ON "Room" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "Room" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_system"()));

-- How many guests asked for each room of a published trip, for "places left". Never who.
CREATE FUNCTION "public_room_taken"(trip_id TEXT)
RETURNS TABLE ("roomId" TEXT, "taken" INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."roomId", COUNT(*)::INTEGER
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
   WHERE g."tripId" = trip_id AND t."published" AND g."roomId" IS NOT NULL
   GROUP BY g."roomId"
$$;
REVOKE ALL ON FUNCTION "public_room_taken"(TEXT) FROM PUBLIC;

-- ── Sign-ups ─────────────────────────────────────────────────────────────────
-- One sign-up per email per trip. The public sign-up inserts with ON CONFLICT DO NOTHING, so a repeat looks the same
-- as a first sign-up: the page never reveals whether an address is already on a trip, and a double tap can't add the
-- same person twice. Any duplicates from before are left alone (the index is built only if none exist).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Guest" GROUP BY "tripId", lower("email") HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX "Guest_tripId_email_key" ON "Guest" ("tripId", lower("email"));
  END IF;
END $$;

-- A public sign-up adds only an interested guest with no confirmed payment: the organizer confirms payments.
DROP POLICY "tenant_insert" ON "Guest";
CREATE POLICY "tenant_insert" ON "Guest" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[])
              OR ((SELECT "app_is_public"()) AND "status" = 'interested' AND "paymentConfirmedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM "Trip" t WHERE t."id" = "tripId" AND t."published")));

-- A guest's room must be on the guest's own trip and have a place left. Locks the room, so two guests can't both
-- take its last place. Runs as the owner because it must count every guest in the room.
CREATE FUNCTION "guest_room_fits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  room RECORD;
  taken INTEGER;
BEGIN
  IF NEW."roomId" IS NULL OR (TG_OP = 'UPDATE' AND NEW."roomId" IS NOT DISTINCT FROM OLD."roomId") THEN
    RETURN NEW;
  END IF;
  SELECT r."tripId", r."capacity", r."name" INTO room FROM "Room" r WHERE r."id" = NEW."roomId" FOR UPDATE;
  IF room IS NULL OR room."tripId" <> NEW."tripId" THEN
    RAISE EXCEPTION 'That room is not on this trip' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*) INTO taken FROM "Guest" g WHERE g."roomId" = NEW."roomId" AND g."id" <> NEW."id";
  IF taken >= room."capacity" THEN
    RAISE EXCEPTION 'room_full:%', room."name" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Guest_5_room_fits" BEFORE INSERT OR UPDATE OF "roomId" ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_room_fits"();
REVOKE ALL ON FUNCTION "guest_room_fits"() FROM PUBLIC;

-- Spots taken on a published trip: approved guests, and on a pay-first trip also everyone who says they've paid
-- (owner's decision, 2026-10-21: they're counted before the organizer confirms). A count only, never who.
CREATE FUNCTION "public_spots_taken"(trip_id TEXT) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COUNT(*)::INTEGER
    FROM "Guest" g JOIN "Trip" t ON t."id" = g."tripId"
   WHERE g."tripId" = trip_id AND t."published"
     AND (g."status" = 'approved' OR (t."payFirst" AND g."paymentSentAt" IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION "public_spots_taken"(TEXT) FROM PUBLIC;

-- Going and interested counts per trip, for the Admin toolbox. Counts only, and only for the admin: the admin's
-- mark reaches no guest row (it seats itself on a trip to see them).
CREATE FUNCTION "admin_trip_counts"()
RETURNS TABLE ("tripId" TEXT, "going" INTEGER, "interested" INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g."tripId",
         COUNT(*) FILTER (WHERE g."status" = 'approved')::INTEGER,
         COUNT(*) FILTER (WHERE g."status" <> 'approved')::INTEGER
    FROM "Guest" g
   WHERE "app_is_admin"()
   GROUP BY g."tripId"
$$;
REVOKE ALL ON FUNCTION "admin_trip_counts"() FROM PUBLIC;

-- ── The admin's access log (Audit Differently's Membership_9_admin_logged) ───
-- Every change the platform admin makes to a trip's people is kept (seating itself, handing a trip to an owner),
-- and every time it opens a trip from the Admin toolbox (admin_log_open). The trip's members can read their trip's
-- lines; nobody writes them but these functions.
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tripId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "role" TEXT,
    "oldRole" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessLog_tripId_idx" ON "AccessLog"("tripId");

ALTER TABLE "AccessLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "AccessLog" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]) OR (SELECT "app_is_admin"()));
-- No insert, update or delete policy: the restricted role can only read lines, never write or change them.

CREATE FUNCTION "trip_member_admin_logged"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT "app_is_admin"() THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW."role" IS NOT DISTINCT FROM OLD."role" THEN RETURN NULL; END IF;
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  INSERT INTO "AccessLog" ("tripId", "actorUserId", "action", "subjectUserId", "role", "oldRole")
  VALUES (r."tripId", "app_user_id"(), lower(TG_OP), r."userId",
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."role" END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."role" END);
  RETURN NULL;
END $$;
CREATE TRIGGER "TripMember_9_admin_logged" AFTER INSERT OR UPDATE OR DELETE ON "TripMember"
  FOR EACH ROW EXECUTE FUNCTION "trip_member_admin_logged"();
REVOKE ALL ON FUNCTION "trip_member_admin_logged"() FROM PUBLIC;

-- The admin opened a trip it already sits on: a line for every look, not only the first.
CREATE FUNCTION "admin_log_open"(trip_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT "app_is_admin"() THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  INSERT INTO "AccessLog" ("tripId", "actorUserId", "action", "subjectUserId")
  VALUES (trip_id, "app_user_id"(), 'open', "app_user_id"());
END $$;
REVOKE ALL ON FUNCTION "admin_log_open"(TEXT) FROM PUBLIC;
