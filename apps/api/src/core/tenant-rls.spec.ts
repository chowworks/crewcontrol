import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { TENANT_TABLES, touchesTenantTable } from './tenant-tables'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Trip isolation on real Postgres, as the restricted role with exactly its privileges: the policies that keep one
// trip from another, the marks, and the triggers that keep a row with its trip.
const suite = dbTestsEnabled ? describe : describe.skip

type Ctx = { trips?: string[]; user?: string; system?: boolean; admin?: boolean; public?: boolean }

suite('trip isolation', () => {
  let db: PGlite

  /** Runs `fn` as the restricted API role with the given request context. */
  async function as<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(
        `SELECT set_config('app.trip_ids', $1, true), set_config('app.user_id', $2, true), set_config('app.system', $3, true), set_config('app.admin', $4, true), set_config('app.public', $5, true)`,
        [
          (ctx.trips ?? []).join(','),
          ctx.user ?? '',
          ctx.system ? 'on' : '',
          ctx.admin ? 'on' : '',
          ctx.public ? 'on' : '',
        ]
      )
      return await fn()
    } finally {
      await db.exec('ROLLBACK')
    }
  }
  /** A person, with their trips worked out the way the API does (trips_of_user). */
  async function person(user: string, extra: Ctx = {}): Promise<Ctx> {
    const r = await db.query<{ t: string[] }>(`SELECT "trips_of_user"($1) AS t`, [user])
    return { user, trips: r.rows[0].t, ...extra }
  }
  /** Runs a statement that may be refused, and keeps the surrounding transaction usable. */
  const attempt = async (sql: string): Promise<{ error?: string; rows?: number }> => {
    await db.exec('SAVEPOINT attempt')
    try {
      const r = await db.query(sql)
      await db.exec('RELEASE SAVEPOINT attempt')
      return { rows: r.affectedRows }
    } catch (e) {
      await db.exec('ROLLBACK TO SAVEPOINT attempt')
      return { error: String((e as Error).message) }
    }
  }
  const ids = async (table: string) =>
    (await db.query<{ id: string }>(`SELECT id FROM "${table}" ORDER BY id`)).rows.map((r) => r.id)
  const refused = expect.stringMatching(/row-level security/)
  // A guest's change to the organizer's fields: the self-limits trigger or the policy, whichever refuses first.
  const guestRefused = expect.stringMatching(/row-level security|only change their room wish/)
  /** A guest's payment, as the join page writes it. */
  const report = (id: string, guest: string, extra = '', extraVals = '') =>
    attempt(
      `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn"${extra}) VALUES ('${id}', 'T1', '${guest}', 100, 'Zelle', 'zelle', '2026-10-24'${extraVals}) RETURNING id`
    )

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    // The restricted role gets exactly what scripts/create-app-role.ts gives it (src/core/app-role-grants.ts).
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
    // T1: published, an owner and an organizer. T2: a draft with another owner. S: a published sample nobody owns.
    await insert(db, 'Trip', { id: 'T1', slug: 't1', published: true, costPerPersonCents: 1000 })
    await insert(db, 'Trip', { id: 'T2', slug: 't2', published: false })
    await insert(db, 'Trip', { id: 'S', slug: 's', published: true, isSample: true })
    await insert(db, 'TripMember', { id: 'M-T1-owner', tripId: 'T1', userId: 'u1', role: 'owner' })
    await insert(db, 'TripMember', {
      id: 'M-T1-org',
      tripId: 'T1',
      userId: 'o1',
      role: 'organizer',
    })
    await insert(db, 'TripMember', { id: 'M-T2-owner', tripId: 'T2', userId: 'u2', role: 'owner' })
    for (const t of ['T1', 'T2', 'S']) {
      await insert(db, 'Guest', {
        id: `G-${t}-a`,
        tripId: t,
        email: `ann-${t}@example.com`,
        status: 'approved',
        firstName: 'Ann',
        lastName: 'Approved',
        createdAt: '2026-01-01T00:00:00Z',
      })
      await insert(db, 'Guest', {
        id: `G-${t}-i`,
        tripId: t,
        email: `ivy@example.com`,
        status: 'interested',
        firstName: 'Ivy',
        lastName: 'Interested',
        createdAt: '2026-01-02T00:00:00Z',
      })
    }
  })

  // Rooms: one on T1 (asked for by T1's approved guest) and one on the draft T2.
  beforeAll(async () => {
    await insert(db, 'Room', { id: 'R-T1', tripId: 'T1', name: 'King', capacity: 2, position: 0 })
    await insert(db, 'Room', { id: 'R-T2', tripId: 'T2', name: 'Twin', capacity: 2, position: 0 })
    await db.query(`UPDATE "Guest" SET "roomId" = 'R-T1' WHERE id = 'G-T1-a'`)
  })

  it('lists exactly the tables that have policies', async () => {
    const r = await db.query<{ t: string }>(
      `SELECT DISTINCT tablename AS t FROM pg_policies WHERE policyname = 'tenant_read' ORDER BY 1`
    )
    expect(r.rows.map((x) => x.t)).toEqual([...TENANT_TABLES].sort())
    const rls = await db.query<{ t: string }>(
      `SELECT relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity ORDER BY 1`
    )
    expect(rls.rows.map((x) => x.t)).toEqual([...TENANT_TABLES].sort())
    expect(touchesTenantTable('Trip', {})).toBe(true)
  })

  it('leaves no table that holds trip data without row-level security', async () => {
    // A new table with a tripId (rooms, payments) that forgot its policies would be open across every trip.
    const r = await db.query<{ t: string }>(
      `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tripId' AND NOT a.attisdropped
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`
    )
    expect(r.rows).toEqual([])
  })

  it('lets only the seed mark a trip as a sample', async () => {
    await as(await person('u1'), async () => {
      expect(await attempt(`UPDATE "Trip" SET "isSample" = true WHERE id = 'T1'`)).toEqual({
        error: expect.stringMatching(/Only the seed/),
      })
      expect(await attempt(`UPDATE "Trip" SET name = 'x' WHERE id = 'T1'`)).toEqual({ rows: 1 })
    })
    await as({ system: true, trips: ['T1', 'T2', 'S'] }, async () => {
      expect(
        await attempt(
          `INSERT INTO "Trip" (id, slug, name, destination, "startDate", "endDate", "organizerName", description, "costPerPersonCents", "updatedAt", "isSample")
           VALUES ('T9', 't9', 'n', 'd', '2027-01-01', '2027-01-02', 'o', 'd', 0, now(), true)`
        )
      ).toEqual({ error: expect.stringMatching(/Only the seed/) })
    })
  })

  it('shows nothing with no context', async () => {
    await as({}, async () => {
      // System settings and email templates are read by everyone; every table of trip data shows nothing.
      for (const t of TENANT_TABLES)
        if (t !== 'SystemSettings' && t !== 'EmailTemplate')
          expect([t, await ids(t)]).toEqual([t, []])
    })
  })

  it('shows an owner their trip, its people and its guests, and nothing of another trip', async () => {
    await as(await person('u1'), async () => {
      expect(await ids('Trip')).toEqual(['T1'])
      expect(await ids('TripMember')).toEqual(['M-T1-org', 'M-T1-owner'])
      expect(await ids('Guest')).toEqual(['G-T1-a', 'G-T1-i'])
      expect(await attempt(`UPDATE "Trip" SET name = 'x' WHERE id = 'T2'`)).toEqual({ rows: 0 })
      expect(await attempt(`DELETE FROM "Guest" WHERE "tripId" = 'T2'`)).toEqual({ rows: 0 })
    })
  })

  it('lets an owner change their trip, its guests and its people, and delete it', async () => {
    await as(await person('u1'), async () => {
      expect(await attempt(`UPDATE "Trip" SET name = 'x' WHERE id = 'T1'`)).toEqual({ rows: 1 })
      expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-T1-i'`)).toEqual({
        rows: 1,
      })
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-new', 'T1', 'o2', 'organizer')`
        )
      ).toEqual({ rows: 1 })
      expect(await attempt(`DELETE FROM "TripMember" WHERE id = 'M-T1-org'`)).toEqual({ rows: 1 })
      expect(await attempt(`DELETE FROM "Trip" WHERE id = 'T1'`)).toEqual({ rows: 1 })
    })
  })

  it('refuses an owner a guest or a person on another trip', async () => {
    await as(await person('u1'), async () => {
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-x', 'T2', 'a', 'b', 'c', 'd')`
        )
      ).toEqual({ error: refused })
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T2', 'u1', 'owner')`
        )
      ).toEqual({ error: refused })
    })
  })

  it("leaves an owner unable to change another trip's people", async () => {
    await as(await person('u1'), async () => {
      expect(
        await attempt(`UPDATE "TripMember" SET role = 'organizer' WHERE id = 'M-T2-owner'`)
      ).toEqual({
        rows: 0,
      })
      expect(await attempt(`DELETE FROM "TripMember" WHERE id = 'M-T2-owner'`)).toEqual({ rows: 0 })
    })
  })

  it('lets an organizer work on the trip but not change its people or delete it', async () => {
    await as(await person('o1'), async () => {
      expect(await ids('Trip')).toEqual(['T1'])
      expect(await attempt(`UPDATE "Trip" SET name = 'x' WHERE id = 'T1'`)).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-x', 'T1', 'a', 'b', 'c', 'd')`
        )
      ).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'o2', 'organizer')`
        )
      ).toEqual({ error: refused })
      expect(await attempt(`UPDATE "TripMember" SET role = 'owner' WHERE id = 'M-T1-org'`)).toEqual(
        {
          rows: 0,
        }
      )
      expect(await attempt(`DELETE FROM "Trip" WHERE id = 'T1'`)).toEqual({ rows: 0 })
    })
  })

  it('lets nobody seat themselves on a trip or create one', async () => {
    await as(await person('u3'), async () => {
      expect(await ids('Trip')).toEqual([])
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'u3', 'owner')`
        )
      ).toEqual({ error: refused })
      expect(
        await attempt(
          `INSERT INTO "Trip" (id, slug, name, destination, "startDate", "endDate", "organizerName", description, "costPerPersonCents", "updatedAt")
           VALUES ('T9', 't9', 'n', 'd', '2027-01-01', '2027-01-02', 'o', 'd', 0, now())`
        )
      ).toEqual({ error: refused })
    })
  })

  it('reads owner rights from TripMember, not from the settings', async () => {
    await as({ user: 'o1', trips: ['T1'] }, async () => {
      expect(await attempt(`DELETE FROM "Trip" WHERE id = 'T1'`)).toEqual({ rows: 0 })
    })
  })

  it('keeps a guest and a membership with their trip and person', async () => {
    await as(await person('u1'), async () => {
      expect(await attempt(`UPDATE "Guest" SET "tripId" = 'T1' WHERE id = 'G-T1-a'`)).toEqual({
        rows: 1,
      })
    })
    // Even the owner of both trips cannot move a guest between them.
    await db.query(
      `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-T2-u1', 'T2', 'u1', 'owner')`
    )
    try {
      await as(await person('u1'), async () => {
        expect(await attempt(`UPDATE "Guest" SET "tripId" = 'T2' WHERE id = 'G-T1-a'`)).toEqual({
          error: expect.stringMatching(/cannot be changed/),
        })
        expect(
          await attempt(`UPDATE "TripMember" SET "userId" = 'u9' WHERE id = 'M-T1-org'`)
        ).toEqual({ error: expect.stringMatching(/cannot be changed/) })
      })
    } finally {
      await db.query(`DELETE FROM "TripMember" WHERE id = 'M-T2-u1'`)
    }
  })

  it('lets trusted work create a trip with its owner and read every trip', async () => {
    const all = await db.query<{ t: string[] }>(`SELECT "all_trip_ids"() AS t`)
    await as({ system: true, trips: all.rows[0].t }, async () => {
      expect(await ids('Trip')).toEqual(['S', 'T1', 'T2'])
      expect(
        await attempt(
          `INSERT INTO "Trip" (id, slug, name, destination, "startDate", "endDate", "organizerName", description, "costPerPersonCents", "updatedAt")
           VALUES ('T9', 't9', 'n', 'd', '2027-01-01', '2027-01-02', 'o', 'd', 0, now()) RETURNING id`
        )
      ).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-T9', 'T9', 'u9', 'owner') RETURNING id`
        )
      ).toEqual({ rows: 1 })
    })
  })

  it('does not count the system mark beside a person', async () => {
    await as(await person('u3', { system: true }), async () => {
      expect(await ids('Trip')).toEqual([])
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'u3', 'owner')`
        )
      ).toEqual({ error: refused })
    })
  })

  it('shows the admin every trip, its people and its guests read-only, and lets it seat people', async () => {
    await as(await person('a1', { admin: true }), async () => {
      expect(await ids('Trip')).toEqual(['S', 'T1', 'T2'])
      expect(await ids('TripMember')).toEqual(['M-T1-org', 'M-T1-owner', 'M-T2-owner'])
      // A look without a seat (owner's decision, 2026-10-28): it reads every guest and changes none.
      expect(await ids('Guest')).toEqual(['G-S-a', 'G-S-i', 'G-T1-a', 'G-T1-i', 'G-T2-a', 'G-T2-i'])
      expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-T1-i'`)).toEqual({
        rows: 0,
      })
      expect(await attempt(`DELETE FROM "Guest" WHERE id = 'G-T1-i'`)).toEqual({ rows: 0 })
      expect(await attempt(`UPDATE "Trip" SET name = 'x' WHERE id = 'T1'`)).toEqual({ rows: 0 })
      expect(await attempt(`DELETE FROM "Trip" WHERE id = 'T2'`)).toEqual({ rows: 0 })
      // Handing the sample trip to an organizer, or seating itself to work on it.
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-S', 'S', 'a1', 'owner') RETURNING id`
        )
      ).toEqual({ rows: 1 })
      expect(await attempt(`DELETE FROM "TripMember" WHERE id = 'M-T2-owner'`)).toEqual({ rows: 1 })
    })
    // Once seated, the admin works on the trip as a member, through the next query's context.
    await db.query(
      `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-S', 'S', 'a1', 'organizer')`
    )
    try {
      await as(await person('a1', { admin: true }), async () => {
        expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-S-i'`)).toEqual({
          rows: 1,
        })
      })
    } finally {
      await db.query(`DELETE FROM "TripMember" WHERE id = 'M-S'`)
    }
  })

  it("keeps a trip's invites to its members, lets its owners and the admin give them, and trusted work claim them", async () => {
    const invite = (id: string, trip: string, email: string) =>
      `INSERT INTO "TripInvite" (id, "tripId", email, role, "invitedBy") VALUES ('${id}', '${trip}', '${email}', 'organizer', 'x')`
    await as(await person('u1'), async () => {
      expect(await attempt(invite('I-u', 'T1', 'dana@example.com'))).toEqual({ rows: 1 })
      expect(await attempt(invite('I-x', 'T2', 'dana@example.com'))).toEqual({ error: refused })
      // Kept lowercased, so a sign-in in any case matches.
      expect(await attempt(invite('I-y', 'T1', 'Dana2@example.com'))).toEqual({
        error: expect.stringMatching(/TripInvite_email_check/),
      })
    })
    await as(await person('a1', { admin: true }), async () => {
      expect(await attempt(invite('I-a', 'T2', 'fay@example.com'))).toEqual({ rows: 1 })
    })
    await db.query(invite('I-1', 'T1', 'dana@example.com'))
    await db.query(invite('I-2', 'T2', 'eve@example.com'))
    try {
      await as(await person('o1'), async () => {
        expect(await ids('TripInvite')).toEqual(['I-1'])
        expect(await attempt(invite('I-o', 'T1', 'gus@example.com'))).toEqual({ error: refused })
        expect(await attempt(`DELETE FROM "TripInvite" WHERE id = 'I-1'`)).toEqual({ rows: 0 })
      })
      await as(await person('u2'), async () => {
        expect(await ids('TripInvite')).toEqual(['I-2'])
      })
      await as({ system: true }, async () => {
        expect(await ids('TripInvite')).toEqual(['I-1', 'I-2'])
        expect(await attempt(`DELETE FROM "TripInvite" WHERE id = 'I-1'`)).toEqual({ rows: 1 })
      })
    } finally {
      await db.query(`DELETE FROM "TripInvite"`)
    }
  })

  it("keeps a trip's vendor expenses to its members: the admin only reads them, guests never see them", async () => {
    const expense = (id: string, trip: string) =>
      `INSERT INTO "Expense" (id, "tripId", payee, "amountCents", "createdByUserId") VALUES ('${id}', '${trip}', 'Seaside Rentals', 50000, 'x')`
    await db.query(expense('E-1', 'T1'))
    await db.query(expense('E-2', 'T2'))
    await insert(db, 'Guest', {
      id: 'G-exp',
      tripId: 'T1',
      userId: 'g-exp',
      email: 'gil@example.com',
      status: 'approved',
      firstName: 'Gil',
      lastName: 'Guest',
    })
    try {
      await as(await person('o1'), async () => {
        expect(await ids('Expense')).toEqual(['E-1'])
        expect(await attempt(expense('E-o', 'T1'))).toEqual({ rows: 1 })
        expect(await attempt(expense('E-x', 'T2'))).toEqual({ error: refused })
        expect(await attempt(`UPDATE "Expense" SET "paidOn" = '2026-11-01'`)).toEqual({ rows: 2 })
        expect(await attempt(`UPDATE "Expense" SET "tripId" = 'T2' WHERE id = 'E-1'`)).toEqual({
          error: expect.stringMatching(/cannot be changed|row-level security/),
        })
        expect(await attempt(`DELETE FROM "Expense"`)).toEqual({ rows: 2 })
      })
      await as(await person('a1', { admin: true }), async () => {
        expect(await ids('Expense')).toEqual(['E-1', 'E-2'])
        expect(await attempt(expense('E-a', 'T1'))).toEqual({ error: refused })
        expect(await attempt(`UPDATE "Expense" SET "amountCents" = 1`)).toEqual({ rows: 0 })
        expect(await attempt(`DELETE FROM "Expense"`)).toEqual({ rows: 0 })
      })
      await as(await person('g-exp'), async () => {
        expect(await ids('Expense')).toEqual([])
        expect(await attempt(expense('E-g', 'T1'))).toEqual({ error: refused })
      })
      await as({ public: true }, async () => {
        expect(await ids('Expense')).toEqual([])
      })
      await expect(db.query(`UPDATE "Expense" SET "amountCents" = 0`)).rejects.toThrow(
        /Expense_amount_check/
      )
    } finally {
      await db.query(`DELETE FROM "Expense"`)
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-exp'`)
    }
  })

  it("keeps a guest's balance adjustments to the trip and that guest: removed, never edited or deleted", async () => {
    const adjust = (id: string, trip: string, guest: string, kind = 'credit', cents = 300) =>
      `INSERT INTO "BalanceAdjustment" (id, "tripId", "guestId", kind, "amountCents", reason, "createdByUserId") VALUES ('${id}', '${trip}', '${guest}', '${kind}', ${cents}, 'Drove the van', 'o1')`
    await insert(db, 'Guest', {
      id: 'G-adj',
      tripId: 'T1',
      userId: 'g-adj',
      email: 'ada@example.com',
      status: 'approved',
      firstName: 'Ada',
      lastName: 'Guest',
    })
    await db.query(adjust('A-1', 'T1', 'G-adj'))
    await db.query(adjust('A-2', 'T2', 'G-T2-a', 'charge'))
    try {
      await as(await person('o1'), async () => {
        expect(await attempt(adjust('A-o', 'T1', 'G-adj', 'charge'))).toEqual({ rows: 1 })
        // Named as made by someone else: refused.
        expect(await attempt(adjust('A-n', 'T1', 'G-adj').replace(`'o1')`, `'u1')`))).toEqual({
          error: refused,
        })
        expect(await attempt(adjust('A-x', 'T2', 'G-T2-a'))).toEqual({ error: refused })
        // Never pointed at another trip's guest.
        expect(await attempt(adjust('A-y', 'T1', 'G-T2-a'))).toEqual({
          error: expect.stringMatching(/foreign key/),
        })
        expect(await ids('BalanceAdjustment')).toEqual(['A-1', 'A-o'])
        expect(await attempt(`UPDATE "BalanceAdjustment" SET "amountCents" = 1`)).toEqual({
          error: expect.stringMatching(/only be removed/),
        })
        expect(await attempt(`UPDATE "BalanceAdjustment" SET reason = 'x'`)).toEqual({
          error: expect.stringMatching(/only be removed/),
        })
        expect(await attempt(`DELETE FROM "BalanceAdjustment"`)).toEqual({ rows: 0 })
      })
      await as(await person('g-adj'), async () => {
        // The guest reads their own, and adds or changes none.
        expect(await ids('BalanceAdjustment')).toEqual(['A-1'])
        expect(await attempt(adjust('A-g', 'T1', 'G-adj', 'credit', 900))).toEqual({
          error: refused,
        })
        expect(
          await attempt(`UPDATE "BalanceAdjustment" SET "removedAt" = now() WHERE id = 'A-1'`)
        ).toEqual({ rows: 0 })
        // The credit lowers what's left of the price (1000 - 300): 750 is too much, 700 fits.
        expect(
          await attempt(
            `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-adj', 'T1', 'G-adj', 750, 'Zelle', 'zelle', '2026-10-24')`
          )
        ).toEqual({ error: expect.stringMatching(/more_than_left/) })
        expect(
          await attempt(
            `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-adj', 'T1', 'G-adj', 700, 'Zelle', 'zelle', '2026-10-24')`
          )
        ).toEqual({ rows: 1 })
      })
      await as(await person('a1', { admin: true }), async () => {
        expect(await ids('BalanceAdjustment')).toEqual(['A-1', 'A-2'])
        expect(await attempt(adjust('A-a', 'T1', 'G-adj'))).toEqual({ error: refused })
      })
      await as({ public: true }, async () => {
        expect(await ids('BalanceAdjustment')).toEqual([])
      })
      await as(await person('o1'), async () => {
        // With 700 of 700 reported, a credit would leave less to pay than is on its way.
        expect(
          await attempt(
            `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-adj', 'T1', 'G-adj', 700, 'Zelle', 'zelle', '2026-10-24')`
          )
        ).toEqual({ rows: 1 })
        expect(await attempt(adjust('A-c', 'T1', 'G-adj', 'credit', 1))).toEqual({
          error: expect.stringMatching(/more_than_left/),
        })
        expect(
          await attempt(
            `UPDATE "BalanceAdjustment" SET "removedAt" = now(), "removedByUserId" = 'u1' WHERE id = 'A-1'`
          )
        ).toEqual({ error: refused })
        expect(
          await attempt(
            `UPDATE "BalanceAdjustment" SET "removedAt" = now(), "removedByUserId" = 'o1' WHERE id = 'A-1'`
          )
        ).toEqual({ rows: 1 })
        // Removed once, for good.
        expect(
          await attempt(`UPDATE "BalanceAdjustment" SET "removedAt" = NULL WHERE id = 'A-1'`)
        ).toEqual({ error: expect.stringMatching(/only be removed/) })
        // Each is a line in the guest's history, with its amount and who did it (the seed's for A-1 itself).
        const lines = await db.query<{ kind: string; amount: number; actor: string }>(
          `SELECT kind, amount, actor FROM "GuestEvent" WHERE "adjustmentId" = 'A-1' ORDER BY n`
        )
        expect(lines.rows).toEqual([
          { kind: 'credit_added', amount: 300, actor: 'system' },
          { kind: 'credit_removed', amount: 300, actor: 'organizer' },
        ])
      })
      await expect(db.query(adjust('A-0', 'T1', 'G-adj', 'credit', 0))).rejects.toThrow(
        /BalanceAdjustment_amount_check/
      )
      await expect(
        db.query(
          `INSERT INTO "BalanceAdjustment" (id, "tripId", "guestId", kind, "amountCents", reason, "createdByUserId") VALUES ('A-r', 'T1', 'G-adj', 'charge', 100, '  ', 'o1')`
        )
      ).rejects.toThrow(/BalanceAdjustment_reason_check/)
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-adj'`)
      await db.query(`DELETE FROM "BalanceAdjustment"`)
    }
  })

  it('holds the spot once everything left is paid when a credit leaves less than the first installment', async () => {
    // T1 is 1000 in one payment: 700 arrived, then a 300 credit pays the spot, and taking it back unpays it.
    const paid = async () =>
      (
        await db.query<{ paid: boolean }>(
          `SELECT "spotPaidAt" IS NOT NULL AS paid FROM "Guest" WHERE id = 'G-spot'`
        )
      ).rows[0].paid
    await insert(db, 'Guest', {
      id: 'G-spot',
      tripId: 'T1',
      email: 'bo@example.com',
      firstName: 'Bo',
      lastName: 'Guest',
    })
    try {
      await db.query(
        `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", "receivedPaymentAmount", status, method, "methodKind", "sentOn") VALUES ('P-spot', 'T1', 'G-spot', 700, 700, 'confirmed', 'Zelle', 'zelle', '2026-10-24')`
      )
      expect(await paid()).toBe(false)
      await db.query(
        `INSERT INTO "BalanceAdjustment" (id, "tripId", "guestId", kind, "amountCents", reason, "createdByUserId") VALUES ('A-spot', 'T1', 'G-spot', 'credit', 300, 'Drove the van', 'o1')`
      )
      expect(await paid()).toBe(true)
      await db.query(`UPDATE "BalanceAdjustment" SET "removedAt" = now() WHERE id = 'A-spot'`)
      expect(await paid()).toBe(false)
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-spot'`)
    }
  })

  it('does not count the admin mark without a person', async () => {
    await as({ admin: true }, async () => {
      expect(await ids('Trip')).toEqual([])
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'S', 'a1', 'owner')`
        )
      ).toEqual({ error: refused })
    })
  })

  it('shows a public page published trips and no guest row, and signs nobody up', async () => {
    await as({ public: true }, async () => {
      expect(await ids('Trip')).toEqual(['S', 'T1'])
      expect(await ids('Guest')).toEqual([])
      expect(await ids('TripMember')).toEqual([])
      expect(await ids('AgreementSignature')).toEqual([])
      // Joining needs sign-in now: a public page adds no guest at all.
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-new', 'T1', 'a', 'b', 'c', 'd')`
        )
      ).toEqual({ error: refused })
    })
  })

  it("gives a public page a published trip's guest statuses and approved names, never contact details", async () => {
    await as({ public: true }, async () => {
      const r = await db.query<Record<string, string | null>>(
        `SELECT * FROM "public_trip_guests"('T1')`
      )
      expect(r.rows).toEqual([
        { status: 'approved', firstName: 'Ann', lastName: 'Approved' },
        { status: 'interested', firstName: null, lastName: null },
      ])
      expect((await db.query(`SELECT * FROM "public_trip_guests"('T2')`)).rows).toEqual([])
    })
  })

  it('lets a public page change nothing', async () => {
    await as({ public: true }, async () => {
      expect(await attempt(`UPDATE "Guest" SET status = 'approved'`)).toEqual({ rows: 0 })
      expect(await attempt(`DELETE FROM "Guest"`)).toEqual({ rows: 0 })
      expect(await attempt(`UPDATE "Trip" SET published = true`)).toEqual({ rows: 0 })
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'x', 'owner')`
        )
      ).toEqual({ error: refused })
    })
  })

  it('does not count the public mark beside a person or with trusted work', async () => {
    await as(await person('u3', { public: true }), async () => {
      expect(await ids('Trip')).toEqual([])
    })
    // Trusted work's mark wins; the public mark adds nothing to it (trusted work reads guests only through its trips).
    await as({ public: true, system: true }, async () => {
      expect(await ids('Guest')).toEqual([])
    })
  })

  it('keeps an owner on every trip, and lets one hand the trip over', async () => {
    await as(await person('u1'), async () => {
      // The check runs at commit; immediate here so a rolled-back test sees it.
      await db.exec('SET CONSTRAINTS "TripMember_9_keeps_an_owner" IMMEDIATE')
      expect(await attempt(`DELETE FROM "TripMember" WHERE id = 'M-T1-owner'`)).toEqual({
        error: expect.stringMatching(/no owner/),
      })
      expect(
        await attempt(`UPDATE "TripMember" SET role = 'organizer' WHERE id = 'M-T1-owner'`)
      ).toEqual({
        error: expect.stringMatching(/no owner/),
      })
      expect(await attempt(`UPDATE "TripMember" SET role = 'owner' WHERE id = 'M-T1-org'`)).toEqual(
        {
          rows: 1,
        }
      )
      expect(await attempt(`DELETE FROM "TripMember" WHERE id = 'M-T1-owner'`)).toEqual({ rows: 1 })
    })
    await as(await person('u1'), async () => {
      await db.exec('SET CONSTRAINTS "TripMember_9_keeps_an_owner" IMMEDIATE')
      expect(await attempt(`DELETE FROM "Trip" WHERE id = 'T1'`)).toEqual({ rows: 1 })
    })
  })

  it("keeps a trip's rooms with its members, and shows a public page only a published trip's rooms", async () => {
    await as(await person('u1'), async () => {
      expect(await ids('Room')).toEqual(['R-T1'])
      expect(
        await attempt(
          `INSERT INTO "Room" (id, "tripId", name, capacity, position) VALUES ('R-x', 'T2', 'x', 1, 0)`
        )
      ).toEqual({ error: refused })
      expect(await attempt(`UPDATE "Room" SET name = 'y' WHERE id = 'R-T2'`)).toEqual({ rows: 0 })
      expect(await attempt(`UPDATE "Room" SET "tripId" = 'T2' WHERE id = 'R-T1'`)).toEqual({
        error: expect.stringMatching(/cannot be changed/),
      })
    })
    await as({ public: true }, async () => {
      expect(await ids('Room')).toEqual(['R-T1'])
      expect(await attempt(`UPDATE "Room" SET name = 'y' WHERE id = 'R-T1'`)).toEqual({ rows: 0 })
      expect(
        await attempt(
          `INSERT INTO "Room" (id, "tripId", name, capacity, position) VALUES ('R-x', 'T1', 'x', 1, 0)`
        )
      ).toEqual({ error: refused })
    })
    await as(await person('a1', { admin: true }), async () => {
      expect(await ids('Room')).toEqual(['R-T1', 'R-T2'])
      expect(await attempt(`UPDATE "Room" SET name = 'x' WHERE id = 'R-T1'`)).toEqual({ rows: 0 })
    })
  })

  it('gives a public page room counts for published trips only, and the admin counts', async () => {
    await as({ public: true }, async () => {
      const taken = await db.query(`SELECT * FROM "public_room_taken"('T1')`)
      expect(taken.rows).toEqual([{ roomId: 'R-T1', taken: 1 }])
      expect((await db.query(`SELECT * FROM "public_room_taken"('T2')`)).rows).toEqual([])
      expect((await db.query(`SELECT * FROM "admin_trip_counts"()`)).rows).toEqual([])
    })
    await as(await person('a1', { admin: true }), async () => {
      const counts = await db.query(`SELECT * FROM "admin_trip_counts"() ORDER BY "tripId"`)
      expect(counts.rows).toEqual([
        { tripId: 'S', going: 1, interested: 1 },
        { tripId: 'T1', going: 1, interested: 1 },
        { tripId: 'T2', going: 1, interested: 1 },
      ])
    })
  })

  it('lets a signed-in person join a published trip as themselves, once, never accepted or paid, into a room with a place', async () => {
    const join = (id: string, cols: string, vals: string) =>
      attempt(
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone${cols}) VALUES ('${id}', 'T1', 'a', 'b', '${id}@example.com', 'p'${vals}) RETURNING id`
      )
    await as(await person('g1'), async () => {
      // Not yet a guest: no trip row to read, but the trip takes their sign-up.
      expect(await ids('Trip')).toEqual([])
      expect(await join('G-j1', ', "userId"', ", 'g1'")).toEqual({ rows: 1 })
      expect(await ids('Guest')).toEqual(['G-j1'])
      expect(await ids('Trip')).toEqual(['T1'])
      // Once per person per trip, and once per email.
      expect(await join('G-j2', ', "userId"', ", 'g1'")).toEqual({
        error: expect.stringMatching(/Guest_tripId_userId_key/),
      })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-j3', 'T1', 'a', 'b', 'G-J1@example.com', 'p')`
        )
      ).toEqual({ error: refused })
    })
    await as(await person('g2'), async () => {
      expect(await join('G-j4', ', "userId"', ", 'someone-else'")).toEqual({ error: refused })
      expect(await join('G-j4', ', "userId", status', ", 'g2', 'approved'")).toEqual({
        error: refused,
      })
      expect(await join('G-j4', ', "userId", "spotPaidAt"', ", 'g2', now()")).toEqual({
        error: refused,
      })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId") VALUES ('G-j4', 'T2', 'a', 'b', 'x@example.com', 'p', 'g2')`
        )
      ).toEqual({ error: refused })
      // T1's king room has one place left (its approved guest has the other).
      expect(await join('G-r1', ', "userId", "roomId"', ", 'g2', 'R-T1'")).toEqual({ rows: 1 })
    })
    // With the king room's last place taken, nobody else gets it.
    await db.query(
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "roomId") VALUES ('G-fill', 'T1', 'a', 'b', 'fill@example.com', 'p', 'R-T1')`
    )
    try {
      await as(await person('g3'), async () => {
        expect(await join('G-r2', ', "userId", "roomId"', ", 'g3', 'R-T1'")).toEqual({
          error: expect.stringMatching(/room_full:King/),
        })
        expect(await join('G-r3', ', "userId", "roomId"', ", 'g3', 'R-T2'")).toEqual({
          error: expect.stringMatching(/not on this trip/),
        })
      })
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-fill'`)
    }
  })

  it('keeps a guest to their own row, signature and payments, and lets them report a payment but not confirm or accept it', async () => {
    // A pay-first trip, where a waiting guest pays (on an accept-first trip they wait to be accepted).
    await db.query(`UPDATE "Trip" SET "joinMode" = 'pay_first' WHERE id = 'T1'`)
    await db.query(
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId") VALUES ('G-me', 'T1', 'Mo', 'Me', 'me@example.com', 'p', 'g9')`
    )
    try {
      await as(await person('g9'), async () => {
        expect(await ids('Guest')).toEqual(['G-me'])
        expect(await ids('TripMember')).toEqual([])
        expect(await ids('Trip')).toEqual(['T1'])
        // Their signature, and nobody else's.
        const sign = (id: string, guest: string, trip: string) =>
          attempt(
            `INSERT INTO "AgreementSignature" (id, "tripId", "guestId", "templateVersion", text, "textHash", "priceCents", "installmentCount", "startDate", "endDate", "refundTerms", "typedName", "ipAddress", "userAgent")
             VALUES ('${id}', '${trip}', '${guest}', 'v', 't', 'h', 1000, 10, 's', 'e', 'r', 'Mo Me', 'ip', 'ua') RETURNING id`
          )
        expect(await sign('A-me', 'G-me', 'T1')).toEqual({ rows: 1 })
        expect(await sign('A-x', 'G-T1-i', 'T1')).toEqual({ error: refused })
        expect(await ids('AgreementSignature')).toEqual(['A-me'])
        expect(await attempt(`UPDATE "AgreementSignature" SET text = 'changed'`)).toEqual({
          rows: 0,
        })
        expect(await attempt(`DELETE FROM "AgreementSignature"`)).toEqual({ rows: 0 })
        // Reporting a payment is theirs; confirming it, accepting or refunding is the organizer's.
        expect(await report('P-me', 'G-me')).toEqual({ rows: 1 })
        expect(await report('P-x', 'G-T1-i')).toEqual({ error: refused })
        expect(
          await report('P-c', 'G-me', ', status, "receivedPaymentAmount"', ", 'confirmed', 100")
        ).toEqual({ error: refused })
        expect(await report('P-o', 'G-me', ', "loggedBy"', ", 'organizer'")).toEqual({
          error: refused,
        })
        expect(await ids('Payment')).toEqual(['P-me'])
        expect(
          await attempt(`UPDATE "Payment" SET status = 'confirmed', "receivedPaymentAmount" = 100`)
        ).toEqual({ rows: 0 })
        expect(await attempt(`DELETE FROM "Payment"`)).toEqual({ rows: 0 })
        expect(await attempt(`UPDATE "Guest" SET "spotPaidAt" = now()`)).toEqual({
          error: guestRefused,
        })
        expect(await attempt(`UPDATE "Guest" SET status = 'approved'`)).toEqual({
          error: guestRefused,
        })
        expect(await attempt(`UPDATE "Guest" SET "refundSentAt" = now()`)).toEqual({
          error: guestRefused,
        })
        expect(await attempt(`UPDATE "Guest" SET "firstName" = 'Not me'`)).toEqual({
          error: expect.stringMatching(/only change their room wish/),
        })
        expect(await attempt(`UPDATE "Guest" SET "roomNote" = 'with Sam'`)).toEqual({ rows: 1 })
        expect(await attempt(`UPDATE "Guest" SET "userId" = 'g8'`)).toEqual({
          error: expect.stringMatching(/cannot be changed/),
        })
        expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-T1-i'`)).toEqual(
          { rows: 0 }
        )
        expect(await attempt(`DELETE FROM "Guest"`)).toEqual({ rows: 0 })
      })
      // The trip's members read the signature; another trip's owner does not.
      await db.query(
        `INSERT INTO "AgreementSignature" (id, "tripId", "guestId", "templateVersion", text, "textHash", "priceCents", "installmentCount", "startDate", "endDate", "refundTerms", "typedName", "ipAddress", "userAgent")
         VALUES ('A-me', 'T1', 'G-me', 'v', 't', 'h', 1000, 10, 's', 'e', 'r', 'Mo Me', 'ip', 'ua')`
      )
      await db.query(
        `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-me', 'T1', 'G-me', 100, 'Zelle', 'zelle', '2026-10-24')`
      )
      await as(await person('u1'), async () => {
        expect(await ids('AgreementSignature')).toEqual(['A-me'])
        expect(await attempt(`UPDATE "AgreementSignature" SET text = 'changed'`)).toEqual({
          rows: 0,
        })
        // The organizer confirms what arrived; the guest's spot is paid once that covers the first payment (1000 in 10 installments: 100).
        expect(await ids('Payment')).toEqual(['P-me'])
        expect(
          await attempt(
            `UPDATE "Payment" SET status = 'confirmed', "receivedPaymentAmount" = 100, "decidedAt" = now()`
          )
        ).toEqual({ rows: 1 })
        const g = await db.query<{ paid: boolean }>(
          `SELECT "spotPaidAt" IS NOT NULL AS paid FROM "Guest" WHERE id = 'G-me'`
        )
        expect(g.rows[0].paid).toBe(true)
        expect(await attempt(`DELETE FROM "Payment"`)).toEqual({ rows: 0 })
      })
      await as(await person('u2'), async () => {
        expect(await ids('AgreementSignature')).toEqual([])
        expect(await ids('Payment')).toEqual([])
      })
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-me'`)
      await db.query(`UPDATE "Trip" SET "joinMode" = 'accept_first' WHERE id = 'T1'`)
    }
  })

  it("never lets a guest undo the organizer's decision", async () => {
    await db.query(
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId", status, "spotPaidAt", "refundSentAt") VALUES
       ('G-no', 'T1', 'No', 'Pe', 'no@example.com', 'p', 'g7', 'declined', now(), now()),
       ('G-in', 'T1', 'In', 'Ok', 'in@example.com', 'p', 'g6', 'approved', now(), NULL)`
    )
    try {
      await as(await person('g7'), async () => {
        expect(await ids('Guest')).toEqual(['G-no'])
        expect(
          await attempt(
            `UPDATE "Guest" SET status = 'interested', "spotPaidAt" = NULL, "refundSentAt" = NULL`
          )
        ).toEqual({ rows: 0 })
      })
      await as(await person('g6'), async () => {
        expect(await attempt(`UPDATE "Guest" SET status = 'interested'`)).toEqual({ rows: 0 })
        expect(await attempt(`UPDATE "Guest" SET "spotPaidAt" = NULL`)).toEqual({ rows: 0 })
      })
      // Turned down: no more payments to report.
      await as(await person('g7'), async () => {
        expect(await report('P-no', 'G-no')).toEqual({
          error: expect.stringMatching(/can't pay yet/),
        })
      })
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id IN ('G-no', 'G-in')`)
    }
  })

  it('lets a guest on an accept-first trip report a payment only once accepted', async () => {
    await db.query(
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId", status) VALUES
       ('G-ok', 'T1', 'Ok', 'Go', 'ok@example.com', 'p', 'g5', 'approved'),
       ('G-wait', 'T1', 'Wa', 'It', 'wait@example.com', 'p', 'g4', 'interested')`
    )
    try {
      await as(await person('g5'), async () => {
        expect(await attempt(`UPDATE "Guest" SET "roomNote" = 'with Sam'`)).toEqual({
          error: expect.stringMatching(/only change their room wish/),
        })
        expect(await attempt(`UPDATE "Guest" SET status = 'interested'`)).toEqual({
          error: guestRefused,
        })
        expect(await report('P-ok', 'G-ok')).toEqual({ rows: 1 })
        // Never more than is left of the price (1000): 100 reported, so 950 more is too much.
        expect(
          await attempt(
            `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-big', 'T1', 'G-ok', 950, 'Zelle', 'zelle', '2026-10-24')`
          )
        ).toEqual({ error: expect.stringMatching(/more_than_left/) })
      })
      await as(await person('g4'), async () => {
        expect(await report('P-wait', 'G-wait')).toEqual({
          error: expect.stringMatching(/can't pay yet/),
        })
      })
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id IN ('G-ok', 'G-wait')`)
    }
  })

  it('never accepts more guests than the trip takes', async () => {
    await as(await person('u1'), async () => {
      expect(await attempt(`UPDATE "Trip" SET "maxGuests" = 1 WHERE id = 'T1'`)).toEqual({
        rows: 1,
      })
      expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-T1-i'`)).toEqual({
        error: expect.stringMatching(/trip_full/),
      })
      // Changing an accepted guest's other details is not a new spot.
      expect(await attempt(`UPDATE "Guest" SET "roomNote" = 'x' WHERE id = 'G-T1-a'`)).toEqual({
        rows: 1,
      })
      expect(await attempt(`UPDATE "Trip" SET "maxGuests" = 2 WHERE id = 'T1'`)).toEqual({
        rows: 1,
      })
      expect(await attempt(`UPDATE "Guest" SET status = 'approved' WHERE id = 'G-T1-i'`)).toEqual({
        rows: 1,
      })
    })
  })

  it("keeps a signature with its guest's own trip", async () => {
    await expect(
      db.query(
        `INSERT INTO "AgreementSignature" (id, "tripId", "guestId", "templateVersion", text, "textHash", "priceCents", "installmentCount", "startDate", "endDate", "refundTerms", "typedName", "ipAddress", "userAgent")
         VALUES ('A-bad', 'T2', 'G-T1-a', 'v', 't', 'h', 1, 1, 's', 'e', 'r', 'n', 'ip', 'ua')`
      )
    ).rejects.toThrow(/AgreementSignature_guestId_tripId_fkey/)
  })

  it("logs every change the admin makes to a trip's people, and lets nobody write the log", async () => {
    await as(await person('a1', { admin: true }), async () => {
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-seat', 'T2', 'a1', 'organizer')`
        )
      ).toEqual({ rows: 1 })
      const log = await db.query(
        `SELECT "tripId", "actorUserId", action, "subjectUserId", role FROM "AccessLog"`
      )
      expect(log.rows).toEqual([
        {
          tripId: 'T2',
          actorUserId: 'a1',
          action: 'insert',
          subjectUserId: 'a1',
          role: 'organizer',
        },
      ])
      expect(
        await attempt(
          `INSERT INTO "AccessLog" ("tripId", "actorUserId", action, "subjectUserId") VALUES ('T1', 'a1', 'x', 'a1')`
        )
      ).toEqual({ error: refused })
      expect(await attempt(`DELETE FROM "AccessLog"`)).toEqual({ rows: 0 })
    })
    // An owner's change to their trip's people is logged too, as theirs (owner's decision, 2026-10-28).
    await as(await person('u1'), async () => {
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-new', 'T1', 'o9', 'organizer')`
        )
      ).toEqual({ rows: 1 })
      const owner = await db.query(
        `SELECT "actorUserId", action, "subjectUserId", role, "byAdmin" FROM "AccessLog" WHERE "tripId" = 'T1'`
      )
      expect(owner.rows).toEqual([
        {
          actorUserId: 'u1',
          action: 'insert',
          subjectUserId: 'o9',
          role: 'organizer',
          byAdmin: false,
        },
      ])
      expect(await attempt(`SELECT "admin_log_open"('T1')`)).toEqual({
        error: expect.stringMatching(/Admins only/),
      })
    })
  })

  it("logs every change to a guest, who made it, to the trip's members only, and lets nobody write the log", async () => {
    const kinds = async (guest: string) =>
      (
        await db.query<{
          kind: string
          actor: string
          fromRoomId: string | null
          toRoomId: string | null
        }>(
          `SELECT kind, actor, "fromRoomId", "toRoomId" FROM "GuestEvent" WHERE "guestId" = $1 ORDER BY at, n`,
          [guest]
        )
      ).rows
    await db.query(
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId") VALUES ('G-log', 'T1', 'Lo', 'Gg', 'log@example.com', 'p', 'g4')`
    )
    try {
      // The guest signs and says they paid; the organizer confirms, accepts and moves their room.
      await db.query(
        `INSERT INTO "AgreementSignature" (id, "tripId", "guestId", "templateVersion", text, "textHash", "priceCents", "installmentCount", "startDate", "endDate", "refundTerms", "typedName", "ipAddress", "userAgent")
         VALUES ('A-log', 'T1', 'G-log', 'v', 't', 'h', 1000, 10, 's', 'e', 'r', 'Lo Gg', 'ip', 'ua')`
      )
      // All as the restricted role, one transaction, switching who is calling between steps.
      await as(await person('g4'), async () => {
        const become = async (user: string) => {
          const { trips = [] } = await person(user)
          await db.query(
            `SELECT set_config('app.user_id', $1, true), set_config('app.trip_ids', $2, true)`,
            [user, trips.join(',')]
          )
        }
        const run = (sql: string) => attempt(sql.replace(/;$/, ''))
        const pay = `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn") VALUES ('P-log', 'T1', 'G-log', 100, 'Zelle', 'zelle', '2026-10-24')`
        // On an accept-first trip the guest pays only once accepted.
        expect(await run(pay)).toEqual({ error: expect.stringMatching(/can't pay yet/) })
        await become('o1')
        expect(
          await run(`UPDATE "Guest" SET status = 'approved', "roomId" = 'R-T1' WHERE id = 'G-log'`)
        ).toEqual({ rows: 1 })
        await become('g4')
        expect(await run(pay)).toEqual({ rows: 1 })
        // A guest never reads the log, their own lines included.
        expect(await ids('GuestEvent')).toEqual([])
        await become('o1')
        expect(
          await run(
            `UPDATE "Payment" SET status = 'confirmed', "receivedPaymentAmount" = 90 WHERE id = 'P-log'`
          )
        ).toEqual({ rows: 1 })
        expect(
          await run(
            `UPDATE "Guest" SET status = 'declined', "refundSentAt" = now() WHERE id = 'G-log'`
          )
        ).toEqual({ rows: 1 })
        // The refunded payment adds no line of its own: the refund is the guest's line.
        expect(await run(`UPDATE "Payment" SET status = 'refunded' WHERE id = 'P-log'`)).toEqual({
          rows: 1,
        })
        // Putting them back clears their refund: one line, not an undone refund.
        expect(
          await run(
            `UPDATE "Guest" SET status = 'interested', "refundSentAt" = NULL WHERE id = 'G-log'`
          )
        ).toEqual({ rows: 1 })
        // A contact change is logged by which detail changed, never its value.
        expect(await run(`UPDATE "Guest" SET phone = 'p2' WHERE id = 'G-log'`)).toEqual({ rows: 1 })
        // The trip's members read it; nobody writes, changes or deletes a line.
        await become('u1')
        expect(
          (await db.query(`SELECT 1 FROM "GuestEvent" WHERE "guestId" = 'G-log'`)).rows
        ).toHaveLength(10)
        expect(
          await run(
            `INSERT INTO "GuestEvent" ("tripId", "guestId", kind, actor) VALUES ('T1', 'G-log', 'accepted', 'organizer')`
          )
        ).toEqual({ error: refused })
        expect(await run(`UPDATE "GuestEvent" SET kind = 'turned_down'`)).toEqual({ rows: 0 })
        expect(await run(`DELETE FROM "GuestEvent"`)).toEqual({ rows: 0 })
        // Another trip's owner reads none of it.
        await become('u2')
        expect((await db.query(`SELECT 1 FROM "GuestEvent" WHERE "tripId" = 'T1'`)).rows).toEqual(
          []
        )
        await db.exec('RESET ROLE')
        expect(await kinds('G-log')).toEqual(
          [
            ['joined', 'system'],
            ['signed', 'system'],
            ['accepted', 'organizer'],
            ['room_changed', 'organizer', 'R-T1'],
            ['said_paid', 'guest'],
            ['payment_confirmed', 'organizer'],
            ['turned_down', 'organizer'],
            ['refund_sent', 'organizer'],
            ['put_back', 'organizer'],
            ['contact_changed', 'organizer'],
          ].map(([kind, actor, toRoomId = null]) => ({ kind, actor, fromRoomId: null, toRoomId }))
        )
        const contact = await db.query(
          `SELECT fields FROM "GuestEvent" WHERE "guestId" = 'G-log' AND kind = 'contact_changed'`
        )
        expect(contact.rows).toEqual([{ fields: 'phone' }])
        // Payment lines say how much: what the guest said they sent, then what arrived.
        const amounts = await db.query(
          `SELECT kind, amount, "paymentId" FROM "GuestEvent" WHERE "guestId" = 'G-log' AND amount IS NOT NULL ORDER BY at, n`
        )
        expect(amounts.rows).toEqual([
          { kind: 'said_paid', amount: 100, paymentId: 'P-log' },
          { kind: 'payment_confirmed', amount: 90, paymentId: 'P-log' },
        ])
      })
    } finally {
      await db.query(`DELETE FROM "Guest" WHERE id = 'G-log'`)
    }
    expect(await kinds('G-log')).toEqual([])
  })

  it("logs a refused join as the person who tried it, to the trip's members only", async () => {
    await as(await person('g3'), async () => {
      expect(
        await attempt(
          `SELECT "log_refused_email"('t1', 'Pat Probe', 'ann-T1@example.com', '555', '192.0.2.9', 'ua', true)`
        )
      ).not.toHaveProperty('error')
      // A draft trip takes no sign-ups, so nothing is logged for it.
      await attempt(`SELECT "log_refused_email"('t2', 'n', 'e', 'p', 'ip', 'ua', false)`)
      // The person who tried reads nothing, and nobody writes the table directly.
      expect(await ids('TripLog')).toEqual([])
      expect(
        await attempt(`INSERT INTO "TripLog" ("tripId", kind) VALUES ('T1', 'email_refused')`)
      ).toEqual({ error: refused })
      await db.query(
        `SELECT set_config('app.user_id', 'u1', true), set_config('app.trip_ids', 'T1', true)`
      )
      const rows = await db.query(`SELECT "tripId", "actorUserId", email, blocked FROM "TripLog"`)
      expect(rows.rows).toEqual([
        { tripId: 'T1', actorUserId: 'g3', email: 'ann-T1@example.com', blocked: true },
      ])
      expect(await attempt(`UPDATE "TripLog" SET email = 'x'`)).toEqual({ rows: 0 })
      expect(await attempt(`DELETE FROM "TripLog"`)).toEqual({ rows: 0 })
      await db.query(
        `SELECT set_config('app.user_id', 'u2', true), set_config('app.trip_ids', 'T2', true)`
      )
      expect(await ids('TripLog')).toEqual([])
    })
    await as({}, async () => {
      expect(
        await attempt(`SELECT "log_refused_email"('t1', 'n', 'e', 'p', 'ip', 'ua', false)`)
      ).toEqual({ error: expect.stringMatching(/Sign in first/) })
    })
  })

  it("keeps each person's Terms acceptances to themselves, stamped now, and lets nobody change or remove one", async () => {
    const accept = (id: string, user: string, kind = 'use') =>
      attempt(
        `INSERT INTO "TermsAcceptance" (id, "userId", kind, fingerprint, "acceptedAt", "ipAddress", "userAgent") VALUES ('${id}', '${user}', '${kind}', 'f1', '2001-01-01', 'ip', 'ua')`
      )
    await as(await person('g1'), async () => {
      expect(await accept('TA-1', 'g1')).toEqual({ rows: 1 })
      expect(await accept('TA-2', 'g1', 'organizer')).toEqual({ rows: 1 })
      // Nobody accepts for someone else.
      expect(await accept('TA-3', 'u1')).toEqual({ error: refused })
      const r = await db.query<{ year: number }>(
        `SELECT EXTRACT(YEAR FROM "acceptedAt")::INTEGER AS year FROM "TermsAcceptance" WHERE id = 'TA-1'`
      )
      expect(r.rows[0].year).toBeGreaterThan(2001)
      expect(await attempt(`UPDATE "TermsAcceptance" SET fingerprint = 'f2'`)).toEqual({ rows: 0 })
      expect(await attempt(`DELETE FROM "TermsAcceptance"`)).toEqual({ rows: 0 })
      expect(await ids('TermsAcceptance')).toEqual(['TA-1', 'TA-2'])
    })
    await as(await person('g1'), async () => {
      expect(await accept('TA-4', 'g1', 'other')).toEqual({
        error: expect.stringMatching(/TermsAcceptance_kind_check/),
      })
    })
  })

  it('shows nobody else, trusted work included, a Terms acceptance', async () => {
    await db.query(
      `INSERT INTO "TermsAcceptance" (id, "userId", kind, fingerprint, "ipAddress", "userAgent") VALUES ('TA-u2', 'u2', 'use', 'f1', 'ip', 'ua')`
    )
    await as(await person('u1'), async () => expect(await ids('TermsAcceptance')).toEqual([]))
    await as({ system: true, trips: ['T1', 'T2', 'S'] }, async () =>
      expect(await ids('TermsAcceptance')).toEqual([])
    )
    await as(await person('u2'), async () =>
      expect(await ids('TermsAcceptance')).toEqual(['TA-u2'])
    )
  })

  it("keeps organizers' requests to the admin, and lets each person add only their own", async () => {
    const add = (user: string) =>
      attempt(
        `INSERT INTO "OrganizerRequest" (kind, "userId", text) VALUES ('refund_terms', '${user}', 'Full refund before May')`
      )
    await as(await person('u1'), async () => {
      expect(await add('u1')).toEqual({ rows: 1 })
      expect(await add('u2')).toEqual({ error: refused })
      expect(await ids('OrganizerRequest')).toEqual([])
    })
    await db.query(
      `INSERT INTO "OrganizerRequest" (id, kind, "userId", text) VALUES ('R1', 'refund_terms', 'u1', 'x')`
    )
    try {
      await as(await person('a1', { admin: true }), async () => {
        expect(await ids('OrganizerRequest')).toEqual(['R1'])
        expect(await attempt(`UPDATE "OrganizerRequest" SET text = 'y'`)).toEqual({ rows: 0 })
        expect(await attempt(`DELETE FROM "OrganizerRequest"`)).toEqual({ rows: 0 })
      })
    } finally {
      await db.query(`DELETE FROM "OrganizerRequest"`)
    }
  })

  it('lets anyone ask for early access, once per email, and only the admin read the asks', async () => {
    const ask = (email: string) =>
      attempt(
        `INSERT INTO "EarlyAccessRequest" (name, email) VALUES ('Dana Reyes', '${email}') ON CONFLICT DO NOTHING`
      )
    try {
      await as(await person('u1'), async () => {
        expect(await ask('dana@example.com')).toEqual({ rows: 1 })
        // Asking again keeps the first request.
        expect(await ask('dana@example.com')).toEqual({ rows: 0 })
        expect(await ask('Dana@Example.com')).toEqual({
          error: expect.stringMatching(/EarlyAccessRequest_email_check/),
        })
        expect(await ids('EarlyAccessRequest')).toEqual([])
      })
      await db.query(
        `INSERT INTO "EarlyAccessRequest" (id, name, email) VALUES ('E1', 'Dana Reyes', 'dana@example.com')`
      )
      await as(await person('a1', { admin: true }), async () => {
        expect(await ids('EarlyAccessRequest')).toEqual(['E1'])
        expect(await attempt(`DELETE FROM "EarlyAccessRequest"`)).toEqual({ rows: 0 })
      })
    } finally {
      await db.query(`DELETE FROM "EarlyAccessRequest"`)
    }
  })

  it('lets everyone read the system settings and only the admin change them', async () => {
    const set = (pct: number) =>
      attempt(`UPDATE "SystemSettings" SET "waitlistBufferPercent" = ${pct}`)
    await as(await person('u1'), async () => {
      expect(await ids('SystemSettings')).toEqual([1])
      expect(await set(20)).toEqual({ rows: 0 })
    })
    await as(await person('a1', { admin: true }), async () => {
      expect(await set(20)).toEqual({ rows: 1 })
      expect(await set(101)).toEqual({
        error: expect.stringMatching(/waitlistBufferPercent_check/),
      })
      expect(await attempt(`DELETE FROM "SystemSettings"`)).toEqual({ rows: 0 })
    })
  })

  it('lets only trusted work mark a guest whose email bounced', async () => {
    const mark = () =>
      attempt(
        `SELECT "note_email_problem"('G-T1-a@example.com', 'blocked', 'Hi', 'bounced before')`
      )
    await db.query(`UPDATE "Guest" SET email = 'G-T1-a@example.com' WHERE id = 'G-T1-a'`)
    try {
      await as(await person('u1'), async () =>
        expect(await mark()).toEqual({ error: expect.stringMatching(/Trusted work only/) })
      )
      await as({ system: true, trips: ['T1', 'T2', 'S'] }, async () => {
        expect((await mark()).error).toBeUndefined()
        const r = await db.query<{ p: string }>(
          `SELECT "emailProblem" AS p FROM "Guest" WHERE id = 'G-T1-a'`
        )
        expect(r.rows[0].p).toBe('bounced')
      })
      // Each block above rolls back, so the notice the admin reads is written here as the owner.
      await db.query(
        `INSERT INTO "EmailProblem" (id, address, kind, "guestIds") VALUES ('EP1', 'g-t1-a@example.com', 'blocked', '{G-T1-a}')`
      )
      await db.query(`UPDATE "Guest" SET "emailProblem" = 'bounced' WHERE id = 'G-T1-a'`)
      await as(await person('u1'), async () => {
        expect(await ids('EmailProblem')).toEqual([])
        const r = await db.query(`SELECT * FROM "admin_email_problems"()`)
        expect(r.rows).toEqual([])
      })
      await as(await person('a1', { admin: true }), async () => {
        const r = await db.query<{ kind: string; guests: { name: string; open: boolean }[] }>(
          `SELECT kind, guests FROM "admin_email_problems"()`
        )
        expect(r.rows).toEqual([
          { kind: 'blocked', guests: [expect.objectContaining({ open: true })] },
        ])
      })
    } finally {
      await db.query(`DELETE FROM "EmailProblem"`)
      await db.query(`UPDATE "Guest" SET "emailProblem" = NULL, "emailProblemAt" = NULL`)
    }
  })

  it('lets everyone read the email templates and only the admin write them', async () => {
    const kinds = async () =>
      (await db.query<{ kind: string }>(`SELECT kind FROM "EmailTemplate"`)).rows.map((r) => r.kind)
    const add = (kind: string) =>
      attempt(
        `INSERT INTO "EmailTemplate" (kind, subject, body) VALUES ('${kind}', 'Hi', '<p>Hi</p>')`
      )
    await db.query(
      `INSERT INTO "EmailTemplate" (kind, subject, body) VALUES ('joined', 'Hi', '<p>Hi</p>')`
    )
    try {
      await as(await person('u1'), async () => {
        expect(await kinds()).toEqual(['joined'])
        expect(await add('accepted')).toEqual({ error: refused })
        expect(await attempt(`UPDATE "EmailTemplate" SET subject = 'x'`)).toEqual({ rows: 0 })
        expect(await attempt(`DELETE FROM "EmailTemplate"`)).toEqual({ rows: 0 })
      })
      await as(await person('a1', { admin: true }), async () => {
        expect(await add('accepted')).toEqual({ rows: 1 })
        expect(await attempt(`UPDATE "EmailTemplate" SET subject = 'Hey'`)).toEqual({ rows: 2 })
        expect(await attempt(`DELETE FROM "EmailTemplate"`)).toEqual({ rows: 2 })
      })
    } finally {
      await db.query(`DELETE FROM "EmailTemplate"`)
    }
  })

  it('keeps announcements and their replies to the trip and its accepted guests', async () => {
    // On T1, g-ann and g-ivy are accepted and g-wes is waiting. One post for everyone on the trip, one for those who
    // owed (Ivy only), each with a reply from the trip.
    for (const [id, userId, status] of [
      ['G-AN-a', 'g-ann', 'approved'],
      ['G-AN-i', 'g-ivy', 'approved'],
      ['G-AN-w', 'g-wes', 'interested'],
    ])
      await insert(db, 'Guest', {
        id,
        tripId: 'T1',
        userId,
        status,
        email: `${userId}@example.com`,
      })
    for (const [id, audience] of [
      ['AN-acc', 'accepted'],
      ['AN-owe', 'owing'],
    ])
      await insert(db, 'Announcement', {
        id,
        tripId: 'T1',
        authorUserId: 'u1',
        authorName: 'Una',
        body: 'Hi',
        audience,
      })
    await insert(db, 'AnnouncementRecipient', {
      id: 'AR-owe',
      announcementId: 'AN-owe',
      tripId: 'T1',
      guestId: 'G-AN-i',
    })
    for (const a of ['AN-acc', 'AN-owe'])
      await insert(db, 'AnnouncementReply', {
        id: `RP-${a}`,
        announcementId: a,
        tripId: 'T1',
        authorUserId: 'u1',
        authorName: 'Una',
        body: 'Yes',
      })
    const reply = (id: string, announcement: string, guest: string, user: string) =>
      attempt(
        `INSERT INTO "AnnouncementReply" (id, "announcementId", "tripId", "guestId", "authorUserId", "authorName", body) VALUES ('${id}', '${announcement}', 'T1', '${guest}', '${user}', 'G.', 'Ok')`
      )
    try {
      await expect(
        db.query(`UPDATE "Announcement" SET audience = 'joined' WHERE id = 'AN-acc'`)
      ).rejects.toThrow(/Announcement_audience_check/)
      await as(await person('o1'), async () => {
        expect(await ids('Announcement')).toEqual(['AN-acc', 'AN-owe'])
        expect(await attempt(`UPDATE "Announcement" SET pinned = true`)).toEqual({ rows: 2 })
      })
      await as(await person('u2'), async () => {
        expect(await ids('Announcement')).toEqual([])
        expect(await ids('AnnouncementReply')).toEqual([])
        expect(await attempt(`DELETE FROM "Announcement"`)).toEqual({ rows: 0 })
      })
      await as(await person('g-ann'), async () => {
        expect(await ids('Announcement')).toEqual(['AN-acc'])
        expect(await ids('AnnouncementReply')).toEqual(['RP-AN-acc'])
        expect(await reply('RP-a1', 'AN-acc', 'G-AN-a', 'g-ann')).toEqual({ rows: 1 })
        // Not under a post that isn't for them, not as someone else, and never changing a post.
        expect(await reply('RP-a2', 'AN-owe', 'G-AN-a', 'g-ann')).toEqual({ error: refused })
        expect(await reply('RP-a3', 'AN-acc', 'G-AN-i', 'g-ann')).toEqual({ error: refused })
        expect(await attempt(`UPDATE "Announcement" SET pinned = true`)).toEqual({ rows: 0 })
        // Their own reply goes; the organizer's stays.
        expect(await attempt(`DELETE FROM "AnnouncementReply"`)).toEqual({ rows: 1 })
      })
      await as(await person('g-ivy'), async () => {
        expect(await ids('Announcement')).toEqual(['AN-acc', 'AN-owe'])
        expect(await ids('AnnouncementRecipient')).toEqual(['AR-owe'])
      })
      // Not accepted yet: no announcements, and no replying.
      await as(await person('g-wes'), async () => {
        expect(await ids('Announcement')).toEqual([])
        expect(await ids('AnnouncementReply')).toEqual([])
        expect(await reply('RP-w1', 'AN-acc', 'G-AN-w', 'g-wes')).toEqual({ error: refused })
      })
      // Turned down, they see nothing, not even a post that went to them.
      await db.query(`UPDATE "Guest" SET status = 'declined' WHERE id = 'G-AN-i'`)
      await as(await person('g-ivy'), async () => {
        expect(await ids('Announcement')).toEqual([])
      })
    } finally {
      await db.query(`DELETE FROM "Announcement"`)
      await db.query(`DELETE FROM "Guest" WHERE id IN ('G-AN-a', 'G-AN-i', 'G-AN-w')`)
    }
  })

  it('shows answers for everyone on the trip page, and a question only to its trip and who asked', async () => {
    // On T1: one public answer, one private answer for v1, and a question v2 is waiting on. On T2 (a draft): one public.
    const q = (id: string, tripId: string, status: string, asker: string | null) =>
      insert(db, 'TripQuestion', {
        id,
        tripId,
        status,
        askerUserId: asker,
        question: 'Parking?',
        answer: status === 'waiting' ? null : 'Yes',
      })
    await q('Q-pub', 'T1', 'public', null)
    await q('Q-priv', 'T1', 'private', 'v1')
    await q('Q-wait', 'T1', 'waiting', 'v2')
    await q('Q-T2', 'T2', 'public', null)
    const ask = (id: string, trip: string, user: string, extra = '') =>
      attempt(
        `INSERT INTO "TripQuestion" (id, "tripId", "askerUserId", question${extra ? ', answer, status' : ''}) VALUES ('${id}', '${trip}', '${user}', 'Hot tub?'${extra}) RETURNING id`
      )
    try {
      await expect(
        db.query(`UPDATE "TripQuestion" SET answer = NULL WHERE id = 'Q-pub'`)
      ).rejects.toThrow(/TripQuestion_answered_check/)
      await expect(
        db.query(`UPDATE "TripQuestion" SET status = 'private' WHERE id = 'Q-pub'`)
      ).rejects.toThrow(/TripQuestion_private_check/)
      // The trip page: public answers on a published trip only.
      await as({ public: true }, async () => {
        expect(await ids('TripQuestion')).toEqual(['Q-pub'])
        expect(await ask('Q-x', 'T1', 'v3')).toEqual({ error: refused })
      })
      await as(await person('o1'), async () => {
        expect(await ids('TripQuestion')).toEqual(['Q-priv', 'Q-pub', 'Q-wait'])
        expect(await attempt(`UPDATE "TripQuestion" SET position = 2`)).toEqual({ rows: 3 })
        expect(await attempt(`DELETE FROM "TripQuestion" WHERE id = 'Q-wait'`)).toEqual({ rows: 1 })
      })
      await as(await person('u2'), async () => {
        expect(await ids('TripQuestion')).toEqual(['Q-T2'])
        expect(await attempt(`DELETE FROM "TripQuestion" WHERE "tripId" = 'T1'`)).toEqual({
          rows: 0,
        })
      })
      // Someone signed in reads their own questions, asks on a published trip, and never answers or edits.
      await as(await person('v1'), async () => {
        expect(await ids('TripQuestion')).toEqual(['Q-priv'])
        expect(await ask('Q-v1', 'T1', 'v1')).toEqual({ rows: 1 })
        expect(await ask('Q-v1b', 'T1', 'v2')).toEqual({ error: refused })
        expect(await ask('Q-v1c', 'T2', 'v1')).toEqual({ error: refused })
        expect(await ask('Q-v1d', 'T1', 'v1', ", 'Mine', 'public'")).toEqual({ error: refused })
        expect(await attempt(`UPDATE "TripQuestion" SET question = 'x'`)).toEqual({ rows: 0 })
        expect(await attempt(`DELETE FROM "TripQuestion"`)).toEqual({ rows: 0 })
      })
      await as(await person('v2'), async () => {
        expect(await ids('TripQuestion')).toEqual(['Q-wait'])
      })
    } finally {
      await db.query(`DELETE FROM "TripQuestion"`)
    }
  })

  it('accepts only the two roles', async () => {
    await expect(
      db.query(
        `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'x', 'admin')`
      )
    ).rejects.toThrow(/TripMember_role_check/)
  })
})
