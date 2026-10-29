import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Signing up and paying for other travelers (migration 20261028050000_responsible_party), on real Postgres as the
// restricted role: what the person responsible may do for the travelers they look after, spots, and a traveler taking
// over their own row.
const suite = dbTestsEnabled ? describe : describe.skip

suite('the person responsible for other travelers', () => {
  let db: PGlite

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
    await insert(db, 'Trip', {
      id: 'T',
      slug: 't',
      published: true,
      maxGuests: 3,
      joinMode: 'pay_first',
      costPerPersonCents: 1000,
    })
  })

  /** Runs `sql` as signed-in person `user` and commits; the error message if refused. */
  async function as(
    user: string,
    sql: string,
    params: unknown[] = []
  ): Promise<{ rows: Record<string, unknown>[] } | string> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      await db.query(`SELECT set_config('app.user_id', $1, true)`, [user])
      // The organizer runs trip T.
      if (user === 'org') await db.query(`SELECT set_config('app.trip_ids', 'T', true)`)
      const r = await db.query<Record<string, unknown>>(sql, params)
      await db.exec('COMMIT')
      return { rows: r.rows }
    } catch (e) {
      await db.exec('ROLLBACK')
      return String((e as Error).message)
    }
  }

  /** `user` signs up traveler `id` they look after, with `email`. */
  const signUp = (user: string, id: string, email = 'mom@example.com') =>
    as(
      user,
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
       VALUES ($1, 'T', 'Kid', 'R', $2, 'p', $3) RETURNING "waitlistedAt"`,
      [id, email, user]
    )

  const pay = (user: string, guest: string, id: string) =>
    as(
      user,
      `INSERT INTO "Payment" (id, "tripId", "guestId", "guestPaymentAmount", method, "methodKind", "sentOn",
                              "paidByName")
       VALUES ($1, 'T', $2, 500, 'Zelle', 'zelle', '2026-10-28', 'Mom R')`,
      [id, guest]
    )

  it('signs up travelers who share their email, signs for them, pays for them, and sees only them', async () => {
    expect(await signUp('mom', 'K1')).toEqual({ rows: [{ waitlistedAt: null }] })
    expect(await signUp('mom', 'K2')).toEqual({ rows: [{ waitlistedAt: null }] })
    // The parent joining as themselves, with the same email, is fine too.
    expect(
      await as(
        'mom',
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId")
         VALUES ('M', 'T', 'Mom', 'R', 'mom@example.com', 'p', 'mom')`
      )
    ).toEqual({ rows: [] })
    expect(
      await as(
        'mom',
        `INSERT INTO "AgreementSignature" (id, "tripId", "guestId", "templateVersion", text, "textHash", "priceCents",
           "installmentCount", "startDate", "endDate", "refundTerms", "typedName", "ipAddress", "userAgent")
         VALUES ('S1', 'T', 'K1', 'v', 'x', 'h', 1000, 2, '2027-01-01', '2027-01-02', 'r', 'Mom R', 'ip', 'ua')`
      )
    ).toEqual({ rows: [] })
    expect(await pay('mom', 'K1', 'P1')).toEqual({ rows: [] })
    const seen = await as('mom', `SELECT id FROM "Guest" ORDER BY id`)
    expect(seen).toEqual({ rows: [{ id: 'K1' }, { id: 'K2' }, { id: 'M' }] })
    // What the parent does for a traveler is the guest's side in the history.
    const actors = await db.query<{ actor: string }>(
      `SELECT DISTINCT actor FROM "GuestEvent" WHERE "guestId" = 'K1'`
    )
    expect(actors.rows).toEqual([{ actor: 'guest' }])
    // Someone else sees none of them, and can't pay for them.
    expect(await as('stranger', `SELECT id FROM "Guest"`)).toEqual({ rows: [] })
    expect(await pay('stranger', 'K2', 'P2')).toMatch(/row-level security/)
  })

  it('never signs up someone in another person’s name, or for another account', async () => {
    expect(
      await as(
        'mom',
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
         VALUES ('X', 'T', 'a', 'b', 'x@example.com', 'p', 'dad')`
      )
    ).toMatch(/row-level security|Only the person signing/)
    expect(
      await as(
        'mom',
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId", "managedByUserId")
         VALUES ('X', 'T', 'a', 'b', 'x@example.com', 'p', 'kid', 'mom')`
      )
    ).toMatch(/row-level security/)
    // Nor hands a traveler to someone else.
    expect(await as('mom', `UPDATE "Guest" SET "managedByUserId" = 'dad' WHERE id = 'K2'`)).toMatch(
      /row-level security|room wish/
    )
  })

  it('waitlists a traveler on a full trip, as anyone', async () => {
    await db.query(`UPDATE "Guest" SET status = 'approved' WHERE id IN ('K1', 'K2', 'M')`)
    expect(await signUp('mom', 'K3')).toEqual({ rows: [{ waitlistedAt: expect.any(Date) }] })
    await db.query(`UPDATE "Guest" SET status = 'interested' WHERE id IN ('K1', 'K2', 'M')`)
  })

  it('puts a traveler where the signer is: waiting if they wait, in line with them past the buffer', async () => {
    // Two spots; with the buffer, three people in line before anyone waits.
    await insert(db, 'Trip', {
      id: 'W',
      slug: 'w',
      published: true,
      maxGuests: 2,
      joinMode: 'pay_first',
    })
    const self = (user: string) =>
      as(
        user,
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId")
         VALUES ($1, 'W', 'a', 'b', $2, 'p', $1) RETURNING "waitlistedAt" IS NOT NULL AS w`,
        [user, `${user}@example.com`]
      )
    const kid = (user: string, id: string) =>
      as(
        user,
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
         VALUES ($1, 'W', 'Kid', 'b', $2, 'p', $3) RETURNING "waitlistedAt" IS NOT NULL AS w`,
        [id, `${user}@example.com`, user]
      )
    expect(await self('w1')).toEqual({ rows: [{ w: false }] })
    expect(await self('w2')).toEqual({ rows: [{ w: false }] })
    expect(await self('pa')).toEqual({ rows: [{ w: false }] })
    // The trip is waitlisting now, but the signer is in line: their child joins them there.
    expect(await kid('pa', 'PA1')).toEqual({ rows: [{ w: false }] })
    expect(await self('pb')).toEqual({ rows: [{ w: true }] })
    expect(await kid('pb', 'PB1')).toEqual({ rows: [{ w: true }] })
    // With the line short again, a waiting signer's child still waits; someone not going goes by the trip.
    await db.query(`UPDATE "Guest" SET status = 'declined' WHERE id IN ('w1', 'w2', 'pa', 'PA1')`)
    expect(await kid('pb', 'PB2')).toEqual({ rows: [{ w: true }] })
    expect(await kid('pc', 'PC1')).toEqual({ rows: [{ w: false }] })
  })

  it('offers a traveler their own row by email, gives it only when they take it, once, and never the parent', async () => {
    await signUp('mom', 'K4', 'ava@example.com')
    const claim = (user: string, emails: string[], take = true) =>
      as(user, `SELECT "claim_managed_guest"('t', $1, $2) AS signer`, [emails, take])
    // The parent can't take it, by email or by hand.
    expect(await claim('mom', ['ava@example.com'])).toEqual({ rows: [{ signer: null }] })
    expect(await as('mom', `UPDATE "Guest" SET "userId" = 'mom' WHERE id = 'K4'`)).toMatch(
      /cannot be changed|room wish|Guest_tripId_userId_key/
    )
    // Two travelers share the parent's email: nobody can tell which one, so neither is offered.
    expect(await claim('kid1', ['mom@example.com'])).toEqual({ rows: [{ signer: null }] })
    // Looking changes nothing; taking it does.
    expect(await claim('ava', ['AVA@example.com'], false)).toEqual({ rows: [{ signer: '' }] })
    expect(await as('ava', `SELECT id FROM "Guest"`)).toEqual({ rows: [] })
    expect(await claim('ava', ['AVA@example.com'])).toEqual({ rows: [{ signer: '' }] })
    expect(await as('ava', `SELECT id FROM "Guest"`)).toEqual({ rows: [{ id: 'K4' }] })
    // The parent still sees them, but no longer changes their row; nobody changes the account again.
    expect(await as('mom', `SELECT id FROM "Guest" WHERE id = 'K4'`)).toEqual({
      rows: [{ id: 'K4' }],
    })
    expect(
      await as('mom', `UPDATE "Guest" SET "roomNote" = 'x' WHERE id = 'K4' RETURNING id`)
    ).toEqual({
      rows: [],
    })
    expect(
      await db.query(`UPDATE "Guest" SET "userId" = 'other' WHERE id = 'K4'`).catch(String)
    ).toMatch(/cannot be changed/)
    expect(await claim('ava', ['ava@example.com'])).toEqual({ rows: [{ signer: null }] })
  })

  it('offers the right place again to someone who joined themselves by mistake, once that place is turned down', async () => {
    await signUp('mom', 'K6', 'zed@example.com')
    await as(
      'zed',
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId")
       VALUES ('Z', 'T', 'Zed', 'R', 'zed@example.com', 'p', 'zed')`
    )
    const claim = (take: boolean) =>
      as('zed', `SELECT "claim_managed_guest"('t', $1, $2) AS signer`, [['zed@example.com'], take])
    expect(await claim(false)).toEqual({ rows: [{ signer: null }] })
    await db.query(`UPDATE "Guest" SET status = 'declined' WHERE id = 'Z'`)
    // A payment on the mistaken place keeps it: the organizer sorts the money out first.
    await insert(db, 'Payment', {
      id: 'PZ',
      tripId: 'T',
      guestId: 'Z',
      guestPaymentAmount: 100,
      method: 'Zelle',
      methodKind: 'zelle',
      sentOn: '2026-10-28',
    })
    expect(await claim(false)).toEqual({ rows: [{ signer: null }] })
    await db.query(`UPDATE "Payment" SET status = 'not_received' WHERE id = 'PZ'`)
    expect(await claim(false)).toEqual({ rows: [{ signer: '' }] })
    expect(await claim(true)).toEqual({ rows: [{ signer: '' }] })
    const rows = await db.query(
      `SELECT id, "userId" FROM "Guest" WHERE id IN ('K6', 'Z') ORDER BY id`
    )
    expect(rows.rows).toEqual([
      { id: 'K6', userId: 'zed' },
      { id: 'Z', userId: null },
    ])
  })

  it('caps travelers a person, and never takes the email of someone who joined themselves', async () => {
    await as(
      'friend',
      `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "userId")
       VALUES ('F', 'T', 'a', 'b', 'f@example.com', 'p', 'friend')`
    )
    expect(await signUp('mom', 'K5', 'f@example.com')).toMatch(/email_taken/)
    await insert(db, 'Trip', { id: 'B', slug: 'b', published: true })
    for (let i = 0; i < 10; i++)
      expect(
        await as(
          'dad',
          `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
           VALUES ($1, 'B', 'Kid', 'R', 'dad@example.com', 'p', 'dad')`,
          [`B${i}`]
        )
      ).toEqual({ rows: [] })
    expect(
      await as(
        'dad',
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
         VALUES ('B10', 'B', 'Kid', 'R', 'dad@example.com', 'p', 'dad')`
      )
    ).toMatch(/too_many_travelers/)
  })

  it('lets organizers hand a signed guest only to another guest on the trip with an account', async () => {
    await insert(db, 'TripMember', { id: 'TM', tripId: 'T', userId: 'org', role: 'owner' })
    // A guest the organizer added by hand, unsigned: nobody can be made to sign for them, the organizer least of all.
    await insert(db, 'Guest', { id: 'H', tripId: 'T', email: 'h@example.com', userId: 'h' })
    const hand = (guest: string, to: string) =>
      as('org', `UPDATE "Guest" SET "managedByUserId" = $2 WHERE id = $1 RETURNING id`, [guest, to])
    expect(await hand('H', 'org')).toMatch(/manager_not_on_trip/)
    expect(await hand('H', 'mom')).toMatch(/manager_not_on_trip/)
    // K1 signed (the parent signed for them): it can go to another guest on the trip, never to someone off it.
    expect(await hand('K1', 'ava')).toEqual({ rows: [{ id: 'K1' }] })
    expect(await hand('K1', 'mallory')).toMatch(/manager_not_on_trip/)
    // Nor can an organizer give a row someone else's account.
    expect(await as('org', `UPDATE "Guest" SET "userId" = 'mallory' WHERE id = 'K2'`)).toMatch(
      /cannot be changed/
    )
    // Nor sign up a guest as someone else's.
    expect(
      await as(
        'org',
        `INSERT INTO "Guest" (id, "tripId", "firstName", "lastName", email, phone, "managedByUserId")
         VALUES ('O', 'T', 'a', 'b', 'o@example.com', 'p', 'mom')`
      )
    ).toMatch(/Only the person signing/)
  })
})
