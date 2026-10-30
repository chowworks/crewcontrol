import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Deleting a trip (migration 20261030020000_trip_deletion), on real Postgres as the restricted role: a deleted trip is
// nobody's to read but the admin's and trusted work's, only an owner deletes it, and trusted work erases only a
// deleted trip.
const suite = dbTestsEnabled ? describe : describe.skip

type Ctx = { user?: string; system?: boolean; admin?: boolean }

suite('deleting a trip', () => {
  let db: PGlite

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
  })

  beforeEach(async () => {
    await db.exec(`DELETE FROM "Trip"`)
    await insert(db, 'Trip', { id: 'T', slug: 't', published: true })
    await insert(db, 'TripMember', { tripId: 'T', userId: 'owner', role: 'owner' })
    await insert(db, 'TripMember', { tripId: 'T', userId: 'helper', role: 'organizer' })
    await insert(db, 'Guest', { id: 'G', tripId: 'T', email: 'g@example.com' })
  })

  /** Runs `sql` as the API does for this caller; the error message if refused. */
  async function as<T>(ctx: Ctx, sql: string): Promise<T[] | string> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      const trips = ctx.system
        ? `array_to_string("all_trip_ids"(), ',')`
        : ctx.user
          ? `array_to_string("trips_of_user"('${ctx.user}'), ',')`
          : `''`
      await db.query(
        `SELECT set_config('app.trip_ids', ${trips}, true), set_config('app.user_id', $1, true),
                set_config('app.system', $2, true), set_config('app.admin', $3, true)`,
        [ctx.user ?? '', ctx.system ? 'on' : '', ctx.admin ? 'on' : '']
      )
      const r = await db.query<T>(sql)
      await db.exec('COMMIT')
      return r.rows
    } catch (e) {
      await db.exec('ROLLBACK')
      return String((e as Error).message)
    }
  }

  const deleteAs = (ctx: Ctx) =>
    as(ctx, `UPDATE "Trip" SET "deletedAt" = now(), published = false WHERE id = 'T' RETURNING id`)

  it('lets an owner delete the trip, and not an organizer', async () => {
    expect(await deleteAs({ user: 'helper' })).toMatch(/Only the trip's owners/)
    expect(await deleteAs({ user: 'owner' })).toEqual([{ id: 'T' }])
  })

  it('never leaves a deleted trip published', async () => {
    expect(
      await as({ user: 'owner' }, `UPDATE "Trip" SET "deletedAt" = now() WHERE id = 'T'`)
    ).toMatch(/Trip_deleted_unpublished_check/)
  })

  it('hides a deleted trip and its guests from its own people, not from the admin or trusted work', async () => {
    await deleteAs({ user: 'owner' })
    for (const user of ['owner', 'helper']) {
      expect(await as({ user }, `SELECT id FROM "Trip"`)).toEqual([])
      expect(await as({ user }, `SELECT id FROM "Guest"`)).toEqual([])
    }
    expect(await as({ user: 'admin', admin: true }, `SELECT id FROM "Trip"`)).toEqual([{ id: 'T' }])
    expect(await as({ system: true }, `SELECT id FROM "Guest"`)).toEqual([{ id: 'G' }])
  })

  it('lets trusted work restore a trip and erase only a deleted one, everything on it with it', async () => {
    expect(await as({ system: true }, `DELETE FROM "Trip" WHERE id = 'T' RETURNING id`)).toEqual([])
    await deleteAs({ user: 'owner' })
    expect(
      await as({ system: true }, `UPDATE "Trip" SET "deletedAt" = NULL WHERE id = 'T' RETURNING id`)
    ).toEqual([{ id: 'T' }])
    expect(await as({ user: 'helper' }, `SELECT id FROM "Trip"`)).toEqual([{ id: 'T' }])
    await deleteAs({ user: 'owner' })
    expect(await as({ system: true }, `DELETE FROM "Trip" WHERE id = 'T' RETURNING id`)).toEqual([
      { id: 'T' },
    ])
    const left = await db.query(
      `SELECT id FROM "Guest" UNION ALL SELECT "tripId" FROM "TripMember"`
    )
    expect(left.rows).toEqual([])
  })
})
