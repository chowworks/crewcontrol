import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// The payment log's data move (20261025010000_payment_log): each guest who said they paid gets one payment of the
// first amount their agreement asked for, confirmed if it was, refunded if it was, and the spot stays paid only for
// guests not refunded.
const suite = dbTestsEnabled ? describe : describe.skip
const MIGRATION = '20261025010000_payment_log'

suite('the payment log migration', () => {
  let db: PGlite

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb(MIGRATION)
    await insert(db, 'Trip', { id: 'T', slug: 't', costPerPersonCents: 90000, installmentCount: 3 })
    const sent = '2026-10-20T15:00:00Z'
    const confirmed = '2026-10-21T15:00:00Z'
    const guest = (id: string, extra: Record<string, string | null>) =>
      insert(db, 'Guest', { id, tripId: 'T', email: `${id}@example.com`, ...extra })
    await guest('said', { paymentSentAt: sent })
    await guest('confirmed', { paymentSentAt: sent, paymentConfirmedAt: confirmed })
    await guest('refunded', {
      paymentSentAt: sent,
      paymentConfirmedAt: confirmed,
      refundSentAt: confirmed,
      status: 'declined',
    })
    await guest('none', {})
    // Signed for a different price: their payment is the first installment they agreed to.
    await guest('signed', { paymentSentAt: sent, paymentConfirmedAt: confirmed })
    await insert(db, 'AgreementSignature', {
      id: 'A',
      tripId: 'T',
      guestId: 'signed',
      priceCents: 50000,
      installmentCount: 1,
    })
    await applyMigration(db, MIGRATION)
  })

  it('gives each guest who said they paid one payment, as it stood', async () => {
    const r = await db.query(
      `SELECT "guestId", "guestPaymentAmount", "receivedPaymentAmount", status, "sentOn", method
         FROM "Payment" ORDER BY "guestId"`
    )
    expect(r.rows).toEqual([
      {
        guestId: 'confirmed',
        guestPaymentAmount: 30000,
        receivedPaymentAmount: 30000,
        status: 'confirmed',
        sentOn: '2026-10-20',
        method: 'Not recorded',
      },
      {
        guestId: 'refunded',
        guestPaymentAmount: 30000,
        receivedPaymentAmount: 30000,
        status: 'refunded',
        sentOn: '2026-10-20',
        method: 'Not recorded',
      },
      {
        guestId: 'said',
        guestPaymentAmount: 30000,
        receivedPaymentAmount: null,
        status: 'reported',
        sentOn: '2026-10-20',
        method: 'Not recorded',
      },
      {
        guestId: 'signed',
        guestPaymentAmount: 50000,
        receivedPaymentAmount: 50000,
        status: 'confirmed',
        sentOn: '2026-10-20',
        method: 'Not recorded',
      },
    ])
  })

  it('keeps the spot paid for guests whose payment was confirmed and not refunded', async () => {
    const r = await db.query<{ id: string; paid: boolean }>(
      `SELECT id, "spotPaidAt" IS NOT NULL AS paid FROM "Guest" ORDER BY id`
    )
    expect(r.rows).toEqual([
      { id: 'confirmed', paid: true },
      { id: 'none', paid: false },
      { id: 'refunded', paid: false },
      { id: 'said', paid: false },
      { id: 'signed', paid: true },
    ])
  })
})
