import { paymentPlan, type Guest, type GuestTerms } from '../trips/trip-types'
import { howSoon, isDue, owedBy, remindersFor } from './reminder-plan'

// Which reminders go out, when, to whom, and what a payment reminder asks for.
const terms = (over: Partial<GuestTerms> = {}): GuestTerms => ({
  priceCents: 1200,
  installmentCount: 3,
  startDate: 's',
  endDate: 'e',
  refundTerms: 'r',
  firstInstallmentCents: 600,
  paidCents: 0,
  pendingCents: 0,
  adjustmentCents: 0,
  balanceCents: 1200,
  schedule: paymentPlan(1200, 3, 600, ['2027-01-01', '2027-02-01', '2027-03-01']),
  ...over,
})

const guest = (id: string, over: Partial<Guest> = {}): Guest =>
  ({
    id,
    firstName: id,
    lastName: 'X',
    status: 'approved',
    waitlistedAt: null,
    offeredAt: null,
    terms: terms(),
    ...over,
  }) as Guest

const trip = {
  joinMode: 'accept_first' as const,
  paymentDueDates: ['2027-01-15', '2027-02-15', '2027-03-15'],
  paymentReminderDays: 7,
  keyDates: [
    { date: '2027-02-10', label: 'Book your flight', remindDaysBefore: 14 },
    { date: '2027-02-20', label: 'Arrive' },
  ],
}

const keys = (list: ReturnType<typeof remindersFor>) =>
  list.map((x) => `${x.guest.id} ${x.reminder.key} ${x.reminder.sendOn}`)

describe('remindersFor', () => {
  it('reminds each guest of the payments in the plan they signed, and accepted guests of key dates', () => {
    expect(keys(remindersFor(trip, [guest('dana')], () => false))).toEqual([
      'dana payment:1:2027-01-01 2026-12-25',
      'dana payment:2:2027-02-01 2027-01-25',
      'dana date:2027-02-10:Book your flight 2027-01-27',
      'dana payment:3:2027-03-01 2027-02-22',
    ])
  })

  it('sends an organizer going on their own trip key dates, never payment reminders (issue #53)', () => {
    const me = guest('org', {
      organizer: true,
      terms: terms({ priceCents: 0, adjustmentCents: 23500 }),
    })
    expect(keys(remindersFor(trip, [me], () => false))).toEqual([
      'org date:2027-02-10:Book your flight 2027-01-27',
    ])
  })

  it('uses the trip’s dates for a guest who signed before plans had dates', () => {
    const old = guest('old', { terms: terms({ schedule: paymentPlan(1200, 3, null, []) }) })
    expect(
      remindersFor(trip, [old], () => false)
        .filter((x) => x.reminder.kind === 'payment')
        .map((x) => x.reminder.date)
    ).toEqual(trip.paymentDueDates)
  })

  it('skips payments already covered, guests who can’t pay yet, the turned down and those who stopped updates', () => {
    const paidTwo = guest('paid', { terms: terms({ paidCents: 600, pendingCents: 300 }) })
    expect(
      keys(remindersFor(trip, [paidTwo], () => false)).filter((k) => k.includes('payment'))
    ).toEqual(['paid payment:3:2027-03-01 2027-02-22'])
    // Accept first: someone waiting can't pay yet, and gets no key date reminder either.
    expect(remindersFor(trip, [guest('wait', { status: 'interested' })], () => false)).toEqual([])
    expect(remindersFor(trip, [guest('no', { status: 'declined' })], () => false)).toEqual([])
    expect(remindersFor(trip, [guest('quiet')], (g) => g.id === 'quiet')).toEqual([])
  })

  it('on a pay-first trip reminds a guest still waiting about payments, not key dates', () => {
    const list = remindersFor(
      { ...trip, joinMode: 'pay_first' },
      [guest('wait', { status: 'interested' })],
      () => false
    )
    expect(list.map((x) => x.reminder.kind)).toEqual(['payment', 'payment', 'payment'])
  })

  it('sends nothing for payments when payment reminders are off', () => {
    expect(
      remindersFor({ ...trip, paymentReminderDays: null }, [guest('dana')], () => false).map(
        (x) => x.reminder.kind
      )
    ).toEqual(['date'])
  })
})

describe('owedBy', () => {
  it('asks for the plan’s installments so far, less what was paid or reported, and everything at the end', () => {
    expect(owedBy(terms(), 1)).toBe(600)
    expect(owedBy(terms({ paidCents: 500 }), 2)).toBe(400)
    expect(owedBy(terms({ paidCents: 900, adjustmentCents: 100 }), 3)).toBe(400)
    expect(owedBy(terms({ paidCents: 1200 }), 3)).toBe(0)
  })
})

describe('isDue', () => {
  const r = {
    key: 'k',
    kind: 'date' as const,
    date: '2027-02-10',
    sendOn: '2027-02-03',
    label: 'x',
  }
  it('goes out from the morning of its day until its date has passed', () => {
    expect(isDue(r, new Date('2027-02-03T13:59:00Z'))).toBe(false)
    expect(isDue(r, new Date('2027-02-03T14:00:00Z'))).toBe(true)
    expect(isDue(r, new Date('2027-02-10T23:00:00Z'))).toBe(true)
    expect(isDue(r, new Date('2027-02-11T09:00:00Z'))).toBe(false)
  })
})

describe('howSoon', () => {
  it('says how soon in words', () => {
    expect(howSoon('2027-02-10', '2027-02-10')).toBe('today')
    expect(howSoon('2027-02-10', '2027-02-09')).toBe('tomorrow')
    expect(howSoon('2027-02-10', '2027-02-03')).toBe('in 1 week')
    expect(howSoon('2027-02-10', '2027-02-07')).toBe('in 3 days')
  })
})
