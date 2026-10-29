-- A price per room (issue #30). A room with a price is what a guest who picks it signs, with the trip's payment plan
-- worked out from it; a room without one costs the trip's price. Guests the organizer places in a room priced
-- differently from what they signed are offered the difference as a credit or charge (a BalanceAdjustment), never
-- changed on their own: "roomPriceSettledCents" is the room price that difference was last settled at, so Trip Control
-- asks once per move. A guest can't set it (the room-wish guard allows guests only their room wish).

ALTER TABLE "Room" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "Room" ADD CONSTRAINT "Room_priceCents_check" CHECK ("priceCents" IS NULL OR "priceCents" > 0);

ALTER TABLE "Guest" ADD COLUMN "roomPriceSettledCents" INTEGER;
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_roomPriceSettledCents_check"
  CHECK ("roomPriceSettledCents" IS NULL OR "roomPriceSettledCents" >= 0);
