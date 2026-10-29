import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Scheduled reminders and the payment plan (migration 20261029060000_reminders), on real Postgres as the restricted
// role: only trusted work writes what went out, the trip's members read it, a guest's "Stop updates" is theirs alone,
// and the payment that holds a spot is the first one the guest's signed plan asks for.
const suite = dbTestsEnabled ? describe : describe.skip

type Ctx = { user?: string; trips?: string; system?: boolean }

suite('reminders and the payment plan', () => {
  let db: PGlite

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
    for (const id of ['T', 'U'])
      await insert(db, 'Trip', {
        id,
        slug: id.toLowerCase(),
        published: true,
        joinMode: 'pay_first',
        costPerPersonCents: 1200,
        installmentCount: 3,
      })
    await insert(db, 'Guest', {
      id: 'G',
      tripId: 'T',
      firstName: 'Dana',
      lastName: 'R',
      email: 'dana@example.com',
      phone: 'p',
      userId: 'dana',
    })
    await insert(db, 'AgreementSignature', {
      id: 'S',
      tripId: 'T',
      guestId: 'G',
      priceCents: 1200,
      installmentCount: 3,
      schedule: JSON.stringify([
        { dueOn: '2027-01-01', amountCents: 600 },
        { dueOn: '2027-02-01', amountCents: 300 },
        { dueOn: '2027-03-01', amountCents: 300 },
      ]),
    })
  })

  /** Runs `sql` in a context and commits; the error message if refused. */
  async function as(ctx: Ctx, sql: string): Promise<{ rows: Record<string, unknown>[] } | string> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.trip_ids', $2, true), set_config('app.system', $3, true)`,
        [ctx.user ?? '', ctx.trips ?? '', ctx.system ? 'on' : '']
      )
      const r = await db.query<Record<string, unknown>>(sql)
      await db.exec('COMMIT')
      return { rows: r.rows }
    } catch (e) {
      await db.exec('ROLLBACK')
      return String((e as Error).message)
    }
  }

  const sent = (id: string) =>
    `INSERT INTO "ReminderSend" (id, "tripId", "guestId", key, date, label)
     VALUES ('${id}', 'T', 'G', 'payment:1:2027-01-01', '2027-01-01', 'Payment 1 of 3')`

  it('lets only trusted work record a reminder, once per guest, and only the trip’s members read it', async () => {
    expect(await as({ user: 'org', trips: 'T' }, sent('R0'))).toMatch(/row-level security/)
    expect(await as({ user: 'dana' }, sent('R0'))).toMatch(/row-level security/)
    expect(await as({ system: true, trips: 'T,U' }, sent('R1'))).toEqual({ rows: [] })
    expect(await as({ system: true, trips: 'T,U' }, sent('R2'))).toMatch(/unique|duplicate/)
    expect(await as({ user: 'org', trips: 'T' }, `SELECT id FROM "ReminderSend"`)).toEqual({
      rows: [{ id: 'R1' }],
    })
    expect(await as({ user: 'other', trips: 'U' }, `SELECT id FROM "ReminderSend"`)).toEqual({
      rows: [],
    })
    expect(await as({ user: 'dana' }, `SELECT id FROM "ReminderSend"`)).toEqual({ rows: [] })
  })

  it('gives each guest a secret of their own, and only trusted work stops their updates by it', async () => {
    const token = await db.query<{ t: string }>(
      `SELECT "updatesToken" AS t FROM "Guest" WHERE id = 'G'`
    )
    expect(token.rows[0].t).toMatch(/^[0-9a-f-]{36}$/)
    // A guest can't change it on their own row; trusted work can.
    expect(
      await as({ user: 'dana' }, `UPDATE "Guest" SET "updatesStoppedAt" = now() WHERE id = 'G'`)
    ).toMatch(/room wish|row-level security/)
    expect(
      await as(
        { system: true, trips: 'T,U' },
        `UPDATE "Guest" SET "updatesStoppedAt" = now() WHERE "updatesToken" = '${token.rows[0].t}'`
      )
    ).toEqual({ rows: [] })
  })

  it('holds the spot once confirmed payments reach the first payment of the plan the guest signed', async () => {
    const pay = (id: string, amount: number) =>
      as(
        { user: 'org', trips: 'T' },
        `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", "receivedPaymentAmount", method,
                                "methodKind", "sentOn", status, "loggedBy")
         VALUES ('${id}', 'T', 'G', ${amount}, ${amount}, 'Zelle', 'zelle', '2027-01-01', 'confirmed', 'organizer')`
      )
    const spot = async () =>
      (await db.query<{ s: string | null }>(`SELECT "spotPaidAt" AS s FROM "Guest" WHERE id = 'G'`))
        .rows[0].s
    // An even split would be 400; this plan's first payment is 600.
    expect(await pay('P1', 400)).toEqual({ rows: [] })
    expect(await spot()).toBeNull()
    expect(await pay('P2', 200)).toEqual({ rows: [] })
    expect(await spot()).not.toBeNull()
  })

  it('keeps the plan’s shapes', async () => {
    expect(
      await as(
        { user: 'org', trips: 'T' },
        `UPDATE "Trip" SET "paymentDueDates" = '{}' WHERE id = 'T'`
      )
    ).toMatch(/paymentDueDates_check/)
    expect(
      await as(
        { user: 'org', trips: 'T' },
        `UPDATE "Trip" SET "firstPaymentCents" = 0 WHERE id = 'T'`
      )
    ).toMatch(/firstPaymentCents_check/)
  })
})
