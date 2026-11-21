-- The room planner (issue #93, a paid feature): the organizer's draft of who sleeps where, laid out as named parts of
-- the house with room and landmark tiles on a dotted grid. One draft per trip. It is a decision helper: nothing in it
-- reaches a guest until the organizer applies it, which moves guests through their own Guest rows. It holds names the
-- organizer typed and people from the Interested list, so only the trip's members read or change it, never the
-- public page; the admin reads it, as it reads the rest of a trip.
SET lock_timeout = '10s';

CREATE TABLE "RoomPlan" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "tripId" TEXT NOT NULL,
    -- RoomPlanLayout (packages/types): sections, tiles and bed spots, checked by the API.
    "layout" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,

    CONSTRAINT "RoomPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomPlan_tripId_key" ON "RoomPlan"("tripId");
ALTER TABLE "RoomPlan" ADD CONSTRAINT "RoomPlan_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "RoomPlan_3_keep" BEFORE UPDATE ON "RoomPlan"
  FOR EACH ROW EXECUTE FUNCTION "forbid_reparent"('tripId');

ALTER TABLE "RoomPlan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "RoomPlan" FOR SELECT
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "admin_read" ON "RoomPlan" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "tenant_insert" ON "RoomPlan" FOR INSERT
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "RoomPlan" FOR UPDATE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]))
  WITH CHECK ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "RoomPlan" FOR DELETE
  USING ("tripId" = ANY ((SELECT "app_trip_ids"())::TEXT[]));

-- The planner is a paid feature the admin can give.
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_features_check";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_features_check"
  CHECK ("features" <@ ARRAY['organizer_link', 'custom_domain', 'room_planner']::TEXT[]);
