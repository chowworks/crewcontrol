import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// The waitlist (migration 20261026020000_waitlist), on real Postgres as the restricted role: who joins onto it, and
// that a waitlisted guest pays only once offered a spot.
const suite = dbTestsEnabled ? describe : describe.skip

suite('the waitlist', () => {
  let db: PGlite

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
  })

  /** Joins trip `trip` as signed-in person `user` (the restricted role), and says whether they went on the waitlist. */
  async function join(trip: string, user: string): Promise<boolean> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(`SELECT set_config('app.user_id', $1, true)`, [user])
      const r = await db.query<{ w: boolean }>(
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId")
         VALUES ($1, $2, 'a', 'b', $3, 'p', $4) RETURNING "waitlistedAt" IS NOT NULL AS w`,
        [`G-${user}`, trip, `${user}@example.com`, user]
      )
      await db.exec('COMMIT')
      return r.rows[0].w
    } catch (e) {
      await db.exec('ROLLBACK')
      throw e
    }
  }

  /** Reports a payment as guest `user`; the error message if refused. */
  async function pay(trip: string, user: string): Promise<string | null> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(`SELECT set_config('app.user_id', $1, true)`, [user])
      await db.query(
        `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn")
         VALUES ($1, $2, $3, 100, 'Zelle', 'zelle', '2026-10-26')`,
        [`P-${user}`, trip, `G-${user}`]
      )
      return null
    } catch (e) {
      return String((e as Error).message)
    } finally {
      await db.exec('ROLLBACK')
    }
  }

  it('on a pay-first trip, waitlists newcomers once those who can pay fill the spots left plus 10%', async () => {
    // Three spots, one taken: two left, plus 10% rounded up, so three can be in line to pay.
    await insert(db, 'Trip', {
      id: 'P',
      slug: 'p',
      published: true,
      maxGuests: 3,
      joinMode: 'first_come',
      costPerPersonCents: 1000,
    })
    await insert(db, 'Guest', {
      id: 'G-in',
      tripId: 'P',
      email: 'in@example.com',
      status: 'approved',
    })
    expect(await join('P', 'a')).toBe(false)
    expect(await join('P', 'b')).toBe(false)
    expect(await join('P', 'c')).toBe(false)
    expect(await join('P', 'd')).toBe(true)
    expect(await pay('P', 'a')).toBeNull()
    expect(await pay('P', 'd')).toMatch(/can't pay yet/)
    // Offered the spot (an organizer's change), they can pay.
    await db.query(`UPDATE "Guest" SET "offeredAt" = now() WHERE id = 'G-d'`)
    expect(await pay('P', 'd')).toBeNull()
    const kinds = await db.query<{ kind: string }>(
      `SELECT kind FROM "GuestEvent" WHERE "guestId" = 'G-d' ORDER BY at, n`
    )
    expect(kinds.rows.map((r) => r.kind)).toEqual(['joined', 'waitlisted', 'offered'])
  })

  it('on an accept-first trip, waitlists only once every spot is taken', async () => {
    await insert(db, 'Trip', { id: 'A', slug: 'a', published: true, maxGuests: 1 })
    expect(await join('A', 'e')).toBe(false)
    expect(await join('A', 'f')).toBe(false)
    await db.query(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-e'`)
    expect(await join('A', 'g')).toBe(true)
  })

  it('never waitlists on a trip with no limit, and tells a public page only yes or no', async () => {
    await insert(db, 'Trip', { id: 'N', slug: 'n', published: true, joinMode: 'pay_first' })
    expect(await join('N', 'h')).toBe(false)
    const r = await db.query<{ p: boolean; a: boolean }>(
      `SELECT "public_trip_waitlisting"('P') AS p, "public_trip_waitlisting"('N') AS a`
    )
    expect(r.rows[0]).toEqual({ p: true, a: false })
  })
})
