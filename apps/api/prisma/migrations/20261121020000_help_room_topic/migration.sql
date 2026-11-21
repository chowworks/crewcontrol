-- Help gets a "Room planner" topic for the room planner's answers.
ALTER TABLE "HelpEntry" DROP CONSTRAINT "HelpEntry_topic_check";
ALTER TABLE "HelpEntry" ADD CONSTRAINT "HelpEntry_topic_check"
    CHECK ("topic" IN ('start', 'rooms', 'signups', 'payments', 'tripPage', 'questions'));
