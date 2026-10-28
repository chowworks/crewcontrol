-- The platform admin looks at any trip without a seat (owner's decision, 2026-10-28): the admin mark now reads a
-- trip's guests, rooms, signatures, payments and history, read-only. It still writes none of them; to change a trip
-- the admin adds itself on the trip's People screen, which TripMember_9_admin_logged logs. A plain look is not logged.
-- Permissive policies add up, so each table's own tenant_read stays as it was.
SET lock_timeout = '10s';

CREATE POLICY "admin_read" ON "Guest" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "admin_read" ON "Room" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "admin_read" ON "AgreementSignature" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "admin_read" ON "GuestEvent" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "admin_read" ON "TripLog" FOR SELECT USING ((SELECT "app_is_admin"()));
CREATE POLICY "admin_read" ON "Payment" FOR SELECT USING ((SELECT "app_is_admin"()));
