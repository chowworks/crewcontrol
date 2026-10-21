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

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    // The restricted role gets exactly what scripts/create-app-role.ts gives it (src/core/app-role-grants.ts).
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
    // T1: published, an owner and an organizer. T2: a draft with another owner. S: a published sample nobody owns.
    await insert(db, 'Trip', { id: 'T1', slug: 't1', published: true })
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
      for (const t of TENANT_TABLES) expect([t, await ids(t)]).toEqual([t, []])
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

  it('shows the admin every trip and its people but no guest, and lets it seat people', async () => {
    await as(await person('a1', { admin: true }), async () => {
      expect(await ids('Trip')).toEqual(['S', 'T1', 'T2'])
      expect(await ids('TripMember')).toEqual(['M-T1-org', 'M-T1-owner', 'M-T2-owner'])
      expect(await ids('Guest')).toEqual([])
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
        expect(await ids('Guest')).toEqual(['G-S-a', 'G-S-i'])
      })
    } finally {
      await db.query(`DELETE FROM "TripMember" WHERE id = 'M-S'`)
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

  it('shows a public page published trips, no guest row, and takes a sign-up it cannot read back', async () => {
    await as({ public: true }, async () => {
      expect(await ids('Trip')).toEqual(['S', 'T1'])
      expect(await ids('Guest')).toEqual([])
      expect(await ids('TripMember')).toEqual([])
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-new', 'T1', 'a', 'b', 'c', 'd')`
        )
      ).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-new2', 'T1', 'a', 'b', 'c', 'd') RETURNING id`
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

  it('lets a public page change nothing and sign up nobody to a draft or as approved', async () => {
    await as({ public: true }, async () => {
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-x', 'T2', 'a', 'b', 'c', 'd')`
        )
      ).toEqual({ error: refused })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, status) VALUES ('G-x', 'T1', 'a', 'b', 'c', 'd', 'approved')`
        )
      ).toEqual({ error: refused })
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
      expect(await ids('Room')).toEqual([])
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

  it('takes a public sign-up only once per email, never with a confirmed payment, and only into a room with a place', async () => {
    await as({ public: true }, async () => {
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-dup', 'T1', 'a', 'b', 'New@example.com', 'p') ON CONFLICT DO NOTHING`
        )
      ).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone) VALUES ('G-dup2', 'T1', 'a', 'b', 'new@EXAMPLE.com', 'p') ON CONFLICT DO NOTHING`
        )
      ).toEqual({ rows: 0 })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "paymentConfirmedAt") VALUES ('G-paid', 'T1', 'a', 'b', 'paid@example.com', 'p', now())`
        )
      ).toEqual({ error: refused })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "roomId") VALUES ('G-r1', 'T1', 'a', 'b', 'r1@example.com', 'p', 'R-T1')`
        )
      ).toEqual({ rows: 1 })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "roomId") VALUES ('G-r2', 'T1', 'a', 'b', 'r2@example.com', 'p', 'R-T1')`
        )
      ).toEqual({ error: expect.stringMatching(/room_full:King/) })
      expect(
        await attempt(
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "roomId") VALUES ('G-r3', 'T1', 'a', 'b', 'r3@example.com', 'p', 'R-T2')`
        )
      ).toEqual({ error: expect.stringMatching(/not on this trip/) })
    })
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
    // An owner's own change to their trip's people is theirs to make, not the admin's, so it is not logged.
    await as(await person('u1'), async () => {
      expect(
        await attempt(
          `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-new', 'T1', 'o9', 'organizer')`
        )
      ).toEqual({ rows: 1 })
      expect(await ids('AccessLog')).toEqual([])
      expect(await attempt(`SELECT "admin_log_open"('T1')`)).toEqual({
        error: expect.stringMatching(/Admins only/),
      })
    })
  })

  it('accepts only the two roles', async () => {
    await expect(
      db.query(
        `INSERT INTO "TripMember" (id, "tripId", "userId", role) VALUES ('M-x', 'T1', 'x', 'admin')`
      )
    ).rejects.toThrow(/TripMember_role_check/)
  })
})
