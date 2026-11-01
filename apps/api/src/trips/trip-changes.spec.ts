import { roomChanges, snippet, tripChanges, type RoomState, type TripState } from './trip-changes'

const trip: TripState = {
  slug: 'staycation-2026',
  name: 'Staycation',
  destination: 'Shenandoah',
  startDate: '2026-11-13',
  endDate: '2026-11-15',
  organizerName: 'Kendra',
  description: 'A weekend away',
  costPerPersonCents: 23500,
  installmentCount: 1,
  paymentDueDates: [],
  paymentReminderDays: null,
  firstPaymentCents: null,
  galleryTitle: 'Photos',
  showGuestNames: false,
  paymentMethods: [],
  paymentInstructions: '',
  published: false,
  photos: [{ url: 'r2:trip-photos/a.jpg', caption: '' }],
  highlights: [],
  keyDates: [],
  maxGuests: 5,
  joinMode: 'pay_first',
  refundPolicy: 'first_payment_kept',
  options: { roomChoice: false, roomRequired: false, signupNote: '' },
  saveTheDate: false,
}

describe('tripChanges', () => {
  it('is empty when a save changed nothing (moving between the editor steps)', () => {
    expect(
      tripChanges(trip, { ...trip, photos: [{ url: 'r2:trip-photos/a.jpg', caption: '' }] })
    ).toEqual([])
  })

  it('says what short facts were and became, and only names the rest', () => {
    const after: TripState = {
      ...trip,
      costPerPersonCents: 25000,
      startDate: '2026-11-14',
      endDate: '2026-11-16',
      maxGuests: null,
      published: true,
      photos: [],
      description: 'A long weekend away',
    }
    expect(tripChanges(trip, after)).toEqual([
      { field: 'dates', from: 'Nov 13 – 15, 2026', to: 'Nov 14 – 16, 2026' },
      { field: 'description' },
      { field: 'published', from: 'off', to: 'on' },
      { field: 'spots', from: '5', to: 'no limit' },
      { field: 'price', from: '$235', to: '$250' },
      { field: 'photos' },
    ])
  })

  it('shows the payment plan when its own settings change, not when only the price does', () => {
    expect(tripChanges(trip, { ...trip, costPerPersonCents: 30000 })).toEqual([
      { field: 'price', from: '$235', to: '$300' },
    ])
    expect(
      tripChanges(trip, {
        ...trip,
        installmentCount: 2,
        firstPaymentCents: 10000,
        paymentDueDates: ['2026-11-01', '2026-11-10'],
      })
    ).toEqual([
      { field: 'paymentPlan', from: '$235', to: '$100 by Nov 1, 2026, $135 by Nov 10, 2026' },
    ])
  })

  it('names the join mode and refund terms in words', () => {
    expect(
      tripChanges(trip, { ...trip, joinMode: 'first_come', refundPolicy: 'spot_filled' })
    ).toEqual([
      { field: 'joinMode', from: 'Pay first', to: 'First come, first served' },
      {
        field: 'refundPolicy',
        from: 'First payment kept',
        to: 'Refund only if the spot is filled',
      },
    ])
  })
})

describe('roomChanges', () => {
  const room = (id: string, name: string, extra: Partial<RoomState> = {}): RoomState => ({
    id,
    name,
    beds: '',
    capacity: 2,
    weight: 1,
    bedTypes: ['queen'],
    minPeople: 1,
    priceCents: null,
    ...extra,
  })

  it('is null when nothing changed', () => {
    expect(roomChanges([room('r1', 'Loft')], [room('r1', 'Loft')], 23500)).toBeNull()
  })

  it('names rooms added, removed and renamed, and each new price', () => {
    expect(
      roomChanges(
        [room('r1', 'Loft'), room('r2', 'Den')],
        [room('r1', 'Suite', { priceCents: 30000 }), room('r3', 'Room 4')],
        23500
      )
    ).toEqual({
      what: 'rooms',
      added: ['Room 4'],
      removed: ['Den'],
      renamed: [{ from: 'Loft', to: 'Suite' }],
      prices: [{ room: 'Suite', from: '$235', to: '$300' }],
      other: false,
    })
  })

  it('only says other details changed for beds, sizes or the order', () => {
    const change = roomChanges(
      [room('r1', 'Loft'), room('r2', 'Den')],
      [room('r2', 'Den'), room('r1', 'Loft', { capacity: 3 })],
      23500
    )
    expect(change).toMatchObject({ added: [], removed: [], renamed: [], prices: [], other: true })
  })
})

describe('snippet', () => {
  it('keeps short text and cuts long text with an ellipsis', () => {
    expect(snippet('  Hi\n all ')).toBe('Hi all')
    expect(snippet('x'.repeat(80))).toBe(`${'x'.repeat(59)}…`)
  })
})
