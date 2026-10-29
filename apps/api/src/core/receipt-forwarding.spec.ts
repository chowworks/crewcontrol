import type { PGlite } from '@electric-sql/pglite'
import { RETIRED } from '../receipts/forwarded-queue'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Forwarded receipts (migration 20261029080000_receipt_forwarding), on real Postgres as the restricted role: a trip's
// address is changed but never cleared, every address used is held until the admin releases it, only trusted work
// queues and reads emails before anyone is known, and an organizer only matches or dismisses one waiting for them.
const suite = dbTestsEnabled ? describe : describe.skip

type Ctx = { user?: string; trips?: string; system?: boolean; admin?: boolean }

suite('forwarded receipts', () => {
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
    await insert(db, 'Guest', {
      id: 'H',
      tripId: 'U',
      firstName: 'Kai',
      lastName: 'L',
      email: 'kai@example.com',
      phone: 'p',
    })
  })

  /** Runs `sql` in a context and commits; the error message if refused. */
  async function as(ctx: Ctx, sql: string): Promise<{ rows: Record<string, unknown>[] } | string> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.trip_ids', $2, true),
                set_config('app.system', $3, true), set_config('app.admin', $4, true)`,
        [ctx.user ?? '', ctx.trips ?? '', ctx.system ? 'on' : '', ctx.admin ? 'on' : '']
      )
      const r = await db.query<Record<string, unknown>>(sql)
      await db.exec('COMMIT')
      return { rows: r.rows }
    } catch (e) {
      await db.exec('ROLLBACK')
      return String((e as Error).message)
    }
  }
  const org = { user: 'org', trips: 'T' }
  const system = { system: true, trips: 'T,U' }
  const admin = { user: 'boss', admin: true }
  const setAddress = (trip: string, address: string | null, ctx: Ctx = org) =>
    as(
      ctx,
      `UPDATE "Trip" SET "receiptsAddress" = ${address === null ? 'NULL' : `'${address}'`} WHERE id = '${trip}'`
    )
  const history = async () =>
    (
      await db.query<{ address: string; tripId: string; removed: boolean; released: boolean }>(
        `SELECT address, "tripId", "removedAt" IS NOT NULL AS removed, "releasedAt" IS NOT NULL AS released
           FROM "ReceiptsAddress" ORDER BY "firstUsedAt", address`
      )
    ).rows

  it('keeps every address a trip used, holds it, and never lets it be cleared', async () => {
    expect(await setAddress('T', 'dana-trip')).toEqual({ rows: [] })
    expect(await setAddress('T', 'Bad Address')).toMatch(/receiptsAddress_check/)
    expect(await setAddress('T', 'postmaster')).toMatch(/receiptsAddress_check/)
    expect(await setAddress('T', null)).toMatch(/never cleared/)
    expect(await setAddress('T', 'dana-trip-2')).toEqual({ rows: [] })
    expect(await history()).toEqual([
      { address: 'dana-trip', tripId: 'T', removed: true, released: false },
      { address: 'dana-trip-2', tripId: 'T', removed: false, released: false },
    ])
    // Another trip can't take an address in use, nor one retired and not released.
    expect(await setAddress('U', 'dana-trip-2', { user: 'o2', trips: 'U' })).toMatch(
      /unique|duplicate/
    )
    expect(await setAddress('U', 'dana-trip', { user: 'o2', trips: 'U' })).toMatch(
      /unique|duplicate/
    )
    const taken = (a: string) =>
      as({ user: 'o2', trips: 'U' }, `SELECT "receipts_address_taken"('${a}') AS t`)
    expect(await taken('dana-trip')).toEqual({ rows: [{ t: true }] })
    expect(await taken('free-one')).toEqual({ rows: [{ t: false }] })
  })

  it('shows the history to the admin and trusted work only', async () => {
    const read = (ctx: Ctx) => as(ctx, `SELECT address FROM "ReceiptsAddress"`)
    expect(await read(org)).toEqual({ rows: [] })
    expect(((await read(admin)) as { rows: unknown[] }).rows).toHaveLength(2)
    expect(((await read(system)) as { rows: unknown[] }).rows).toHaveLength(2)
  })

  it('lets only trusted work queue an email, and keeps each trip’s to its members', async () => {
    const queue = (id: string, trip: string | null, status = 'unmatched') =>
      `INSERT INTO "ForwardedReceipt" (id, "emailId", "toAddress", "tripId", status)
       VALUES ('${id}', 'e-${id}', 'x@receipts.example', ${trip ? `'${trip}'` : 'NULL'}, '${status}')`
    expect(await as(org, queue('R0', 'T'))).toMatch(/row-level security/)
    expect(await as(system, queue('R1', 'T'))).toEqual({ rows: [] })
    expect(await as(system, queue('R2', 'U'))).toEqual({ rows: [] })
    expect(await as(system, queue('R3', null, 'rejected'))).toEqual({ rows: [] })
    expect(await as(system, queue('R4', null, 'unmatched'))).toMatch(/trip_check/)
    expect(await as(org, `SELECT id FROM "ForwardedReceipt" ORDER BY id`)).toEqual({
      rows: [{ id: 'R1' }],
    })
    expect(
      ((await as(admin, `SELECT id FROM "ForwardedReceipt"`)) as { rows: unknown[] }).rows
    ).toHaveLength(3)
    expect(await as(org, `DELETE FROM "ForwardedReceipt" WHERE id = 'R1'`)).toEqual({ rows: [] })
    expect(await as(org, `SELECT id FROM "ForwardedReceipt"`)).toEqual({ rows: [{ id: 'R1' }] })
  })

  it('lets an organizer only match or dismiss one waiting for them, on their own trip’s guest', async () => {
    const pay = `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind",
                                        "sentOn", "loggedBy")
                 VALUES ('P1', 'T', 'G', 30000, 'Zelle', 'zelle', '2026-10-22', 'email')`
    expect(await as(org, pay)).toEqual({ rows: [] })
    const record = (guest: string, by = 'org') =>
      as(
        org,
        `UPDATE "ForwardedReceipt" SET status = 'recorded', "guestId" = '${guest}', "paymentId" = 'P1',
                "decidedByUserId" = '${by}' WHERE id = 'R1'`
      )
    // Not another trip's guest, not in someone else's name, and nothing else on the row.
    expect(await record('H')).toMatch(/names its guest/)
    expect(await record('G', 'someone')).toMatch(/only matches or dismisses/)
    expect(
      await as(org, `UPDATE "ForwardedReceipt" SET "amountCents" = 5 WHERE id = 'R1'`)
    ).toMatch(/only matches or dismisses/)
    // Never a payment that isn't the one made from this receipt for that guest.
    await db.exec(`INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn")
                   VALUES ('P0', 'T', 'G', 100, 'Zelle', 'zelle', '2026-10-22')`)
    expect(
      await as(
        org,
        `UPDATE "ForwardedReceipt" SET status = 'recorded', "guestId" = 'G', "paymentId" = 'P0',
                "decidedByUserId" = 'org' WHERE id = 'R1'`
      )
    ).toMatch(/names its guest and payment/)
    expect(
      await as(
        org,
        `UPDATE "ForwardedReceipt" SET status = 'recorded', "guestId" = 'G', "paymentId" = 'P1',
                excerpt = 'edited', "decidedByUserId" = 'org' WHERE id = 'R1'`
      )
    ).toMatch(/names its guest and payment/)
    expect(await record('G')).toEqual({ rows: [] })
    const row = await db.query<{ decided: boolean }>(
      `SELECT "decidedAt" IS NOT NULL AS decided FROM "ForwardedReceipt" WHERE id = 'R1'`
    )
    expect(row.rows[0].decided).toBe(true)
    // Dealt with: it no longer changes.
    expect(
      await as(
        org,
        `UPDATE "ForwardedReceipt" SET status = 'dismissed', "decidedByUserId" = 'org' WHERE id = 'R1' RETURNING id`
      )
    ).toEqual({ rows: [] })
  })

  it('lets the admin put a failed email back in the queue, and nothing else', async () => {
    await as(
      system,
      `UPDATE "ForwardedReceipt" SET status = 'failed', attempts = 5 WHERE id = 'R3'`
    )
    expect(
      await as(admin, `UPDATE "ForwardedReceipt" SET status = 'recorded' WHERE id = 'R3'`)
    ).toMatch(/row-level security|only matches/)
    expect(
      await as(
        admin,
        `UPDATE "ForwardedReceipt" SET status = 'received', attempts = 0, "nextAttemptAt" = now() WHERE id = 'R3'`
      )
    ).toEqual({ rows: [] })
  })

  it('lets only the admin release a retired address, says who, and clears its count', async () => {
    await as(
      system,
      `INSERT INTO "ForwardedReceipt" (id, "emailId", "toAddress", status, reason)
       VALUES ('Old1', 'e-old1', 'dana-trip@receipts.example', 'rejected', '${RETIRED}')`
    )
    const release = (ctx: Ctx, address: string) =>
      as(ctx, `UPDATE "ReceiptsAddress" SET "releasedAt" = now() WHERE address = '${address}'`)
    expect(await release(org, 'dana-trip')).toEqual({ rows: [] })
    expect((await history())[0].released).toBe(false)
    expect(await release(admin, 'dana-trip-2')).toEqual({ rows: [] })
    expect((await history())[1].released).toBe(false)
    expect(await release(admin, 'dana-trip')).toEqual({ rows: [] })
    const row = await db.query<{ by: string; kept: number }>(
      `SELECT "releasedByUserId" AS by,
              (SELECT count(*)::int FROM "ForwardedReceipt" WHERE id = 'Old1') AS kept
         FROM "ReceiptsAddress" WHERE address = 'dana-trip'`
    )
    expect(row.rows[0]).toEqual({ by: 'boss', kept: 0 })
    // Released: another trip may take it now.
    expect(await setAddress('U', 'dana-trip', { user: 'o2', trips: 'U' })).toEqual({ rows: [] })
  })

  it('deletes a trip’s emails with it, and keeps its address held', async () => {
    await insert(db, 'Trip', { id: 'D', slug: 'd', published: true, joinMode: 'pay_first' })
    await db.exec(`UPDATE "Trip" SET "receiptsAddress" = 'gone-trip' WHERE id = 'D'`)
    await as(
      system,
      `INSERT INTO "ForwardedReceipt" (id, "emailId", "toAddress", "tripId", status)
       VALUES ('RD', 'e-rd', 'gone-trip@receipts.example', 'D', 'unmatched')`
    )
    await db.exec(`DELETE FROM "Trip" WHERE id = 'D'`)
    const left = await db.query<{ receipts: number; held: boolean }>(
      `SELECT (SELECT count(*)::int FROM "ForwardedReceipt" WHERE id = 'RD') AS receipts,
              (SELECT "removedAt" IS NOT NULL AND "releasedAt" IS NULL FROM "ReceiptsAddress"
                WHERE address = 'gone-trip') AS held`
    )
    expect(left.rows[0]).toEqual({ receipts: 0, held: true })
  })

  it('takes a payment logged from a forwarded receipt', async () => {
    expect(
      await as(
        system,
        `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn",
                                "loggedBy") VALUES ('P2', 'T', 'G', 100, 'Zelle', 'zelle', '2026-10-22', 'email')`
      )
    ).toEqual({ rows: [] })
    const line = await db.query<{ kind: string; actor: string }>(
      `SELECT kind, actor FROM "GuestEvent" WHERE "paymentId" = 'P2'`
    )
    expect(line.rows).toEqual([{ kind: 'said_paid', actor: 'system' }])
  })

  it('keeps an address tied to a guest to their trip, in the organizer’s own name, lower case', async () => {
    const remember = (ctx: Ctx, values: string) =>
      as(
        ctx,
        `INSERT INTO "PayerAddress" (id, "tripId", "guestId", address, "createdByUserId") VALUES ${values}`
      )
    expect(await remember(org, `('A1', 'T', 'G', 'dana.work@example.net', 'org')`)).toEqual({
      rows: [],
    })
    // Another trip, another trip's guest, someone else's name, or mixed case: refused.
    expect(await remember(org, `('A2', 'U', 'H', 'kai.work@example.net', 'org')`)).toMatch(
      /row-level security/
    )
    expect(await remember(org, `('A3', 'T', 'H', 'kai.work@example.net', 'org')`)).toMatch(
      /foreign key/
    )
    expect(await remember(org, `('A4', 'T', 'G', 'x@example.net', 'someone')`)).toMatch(
      /row-level security/
    )
    expect(await remember(org, `('A5', 'T', 'G', 'Dana@Example.net', 'org')`)).toMatch(/check/)
    // One guest per address on a trip, and never moved to another trip.
    expect(await remember(org, `('A6', 'T', 'G', 'dana.work@example.net', 'org')`)).toMatch(
      /unique/
    )
    expect(
      await as(
        { user: 'org', trips: 'T,U' },
        `UPDATE "PayerAddress" SET "tripId" = 'U', "guestId" = 'H' WHERE id = 'A1'`
      )
    ).toMatch(/cannot be changed/)
    // Others' members and strangers don't see it; trusted work does, and the organizer can remove it.
    expect(await as({ user: 'other', trips: 'U' }, `SELECT id FROM "PayerAddress"`)).toEqual({
      rows: [],
    })
    expect(await as(system, `SELECT id FROM "PayerAddress"`)).toEqual({ rows: [{ id: 'A1' }] })
    expect(
      await as(
        { user: 'other', trips: 'U' },
        `DELETE FROM "PayerAddress" WHERE id = 'A1' RETURNING id`
      )
    ).toEqual({ rows: [] })
    expect(await as(org, `DELETE FROM "PayerAddress" WHERE id = 'A1' RETURNING id`)).toEqual({
      rows: [{ id: 'A1' }],
    })
  })
})
