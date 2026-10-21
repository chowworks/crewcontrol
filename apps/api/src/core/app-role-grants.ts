/**
 * What the restricted database role the API connects as (scripts/create-app-role.ts) may execute. Policies call
 * these as the caller, and the API's context statement calls trips_of_user and all_trip_ids. Every other function
 * (the triggers, the helpers that look across trips) runs only as the database owner. The database spec grants
 * exactly this list, so it tests the real privileges.
 */
export const APP_ROLE_FUNCTIONS: readonly string[] = [
  'app_user_id()',
  'app_trip_ids()',
  'app_owned_trip_ids()',
  'trips_of_user(text)',
  'all_trip_ids()',
  'app_is_system()',
  'app_is_admin()',
  'app_is_public()',
  // The public trip page's view of its guests: statuses, and approved guests' names only.
  'public_trip_guests(text)',
  // A published trip's rooms: how many asked for each, never who.
  'public_room_taken(text)',
  // How many spots are taken on a published trip (approved, plus paid on pay-first trips).
  'public_spots_taken(text)',
  // The Admin toolbox's going and interested counts (admin only, counts only).
  'admin_trip_counts()',
  // A line in the access log each time the admin opens a trip from the Admin toolbox.
  'admin_log_open(text)',
]

/** SQL that gives `role` its table access and exactly the functions above, and nothing else. `role` is a plain identifier. */
export function appRoleGrantsSql(role: string): string[] {
  return [
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`,
    ...APP_ROLE_FUNCTIONS.map((f) => `GRANT EXECUTE ON FUNCTION ${f} TO ${role}`),
    // Prisma's migration history is the owner's alone.
    `DO $$ BEGIN IF to_regclass('public._prisma_migrations') IS NOT NULL THEN REVOKE ALL ON "_prisma_migrations" FROM ${role}; END IF; END $$`,
  ]
}
