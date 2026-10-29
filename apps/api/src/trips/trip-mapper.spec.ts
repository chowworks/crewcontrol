import type { Guest, Trip } from '@prisma/client'
import { shortName, toPublicTrip } from './trip-mapper'

const trip: Trip = {
  id: 't1',
  slug: 'mv-beach-house-2027-ab12',
  name: 'MV Beach House 2027',
  destination: "Martha's Vineyard, MA",
  startDate: '2027-06-18',
  endDate: '2027-06-21',
  organizerName: 'Chris',
  description: 'A long weekend.',
  costPerPersonCents: 120000,
  installmentCount: 4,
  paymentDueDates: [],
  paymentReminderDays: null,
  firstPaymentCents: null,
  galleryTitle: 'The house',
  showGuestNames: true,
  paymentMethods: [{ kind: 'cashapp', label: '', handle: '$chrisMV' }],
  paymentInstructions: 'Zelle Chris, memo MV2027',
  published: true,
  isSample: false,
  maxGuests: null,
  joinMode: 'pay_first',
  refundPolicy: 'spot_filled',
  photos: [{ url: '/seed/mv-1.svg', caption: 'Front' }],
  highlights: [],
  keyDates: [],
  options: { roomChoice: true },
  createdAt: new Date(),
  updatedAt: new Date(),
}

const guest = (id: string, status: string, firstName: string, lastName: string): Guest => ({
  id,
  tripId: 't1',
  firstName,
  lastName,
  email: `${id}@example.com`,
  phone: '555-0100',
  status,
  createdAt: new Date(),
  spotPaidAt: null,
  waitlistedAt: null,
  offeredAt: null,
  refundSentAt: null,
  userId: null,
  managedByUserId: null,
  emailProblem: null,
  emailProblemAt: null,
  roomId: null,
  roomNote: '',
  updatesStoppedAt: null,
  updatesToken: `token-${id}`,
  roomPriceSettledCents: null,
})

const guests = [
  guest('g1', 'approved', 'Jordan', 'Price'),
  guest('g2', 'approved', 'Avery', 'Lane'),
  guest('g3', 'interested', 'Morgan', 'Reed'),
  guest('g4', 'declined', 'Riley', 'Stone'),
]

describe('toPublicTrip', () => {
  it('never exposes payment instructions or guest contact details', () => {
    const json = JSON.stringify(toPublicTrip({ ...trip, guests }))
    expect(json).not.toContain('Zelle')
    expect(json).not.toContain('chrisMV')
    expect(json).not.toContain('@example.com')
    expect(json).not.toContain('555-0100')
  })

  it('names approved guests only, and counts the ones still joining, not the turned down', () => {
    const view = toPublicTrip({ ...trip, guests })
    expect(view.guestNames).toEqual(['Jordan P.', 'Avery L.'])
    expect(view.goingCount).toBe(2)
    expect(view.interestedCount).toBe(1)
    expect(JSON.stringify(view)).not.toContain('Morgan')
    expect(JSON.stringify(view)).not.toContain('Riley')
  })

  it('never carries payment instructions, on any kind of trip', () => {
    for (const joinMode of ['accept_first', 'pay_first', 'first_come']) {
      const view = toPublicTrip({ ...trip, joinMode, guests })
      expect(view).not.toHaveProperty('paymentInstructions')
      expect(JSON.stringify(view)).not.toContain('Zelle')
    }
  })

  it('shows key dates without the organizer’s reminder settings', () => {
    const keyDates = [{ date: '2027-05-01', label: 'Final payment', remindDaysBefore: 7 }]
    expect(toPublicTrip({ ...trip, keyDates, guests }).keyDates).toEqual([
      { date: '2027-05-01', label: 'Final payment' },
    ])
  })

  it('never carries a guest’s stop-updates link', () => {
    expect(JSON.stringify(toPublicTrip({ ...trip, guests }))).not.toContain('token-')
  })

  it('carries no agreement or signature', () => {
    const json = JSON.stringify(toPublicTrip({ ...trip, guests }))
    expect(json).not.toMatch(/agreement|signed|typedName|textHash/i)
  })

  it('shows how many places are left in each room, never who took them', () => {
    const rooms = [
      {
        id: 'r1',
        tripId: 't1',
        position: 0,
        name: 'Primary suite',
        beds: 'King',
        capacity: 2,
        weight: 1.75,
        bedTypes: ['king'],
        minPeople: 2,
        priceCents: null,
      },
    ]
    const view = toPublicTrip({ ...trip, guests, rooms, roomTaken: new Map([['r1', 1]]) })
    expect(view.rooms).toEqual([
      {
        id: 'r1',
        name: 'Primary suite',
        beds: 'King',
        bedTypes: ['king'],
        capacity: 2,
        minPeople: 2,
        spotsLeft: 1,
        priceCents: 120000,
        paymentPlan: [300, 300, 300, 300].map((d) => ({ dueOn: null, amountCents: d * 100 })),
      },
    ])
  })

  it('gives a room priced apart from the trip its own price and plan', () => {
    const rooms = [
      {
        id: 'r1',
        tripId: 't1',
        position: 0,
        name: 'Bunk room',
        beds: '',
        capacity: 4,
        weight: 1,
        bedTypes: [],
        minPeople: 1,
        priceCents: 80000,
      },
    ]
    const view = toPublicTrip({ ...trip, guests, rooms })
    expect(view.rooms[0]).toMatchObject({
      priceCents: 80000,
      paymentPlan: [200, 200, 200, 200].map((d) => ({ dueOn: null, amountCents: d * 100 })),
    })
  })

  it('hides names when the organizer turns them off and guests choose no room', () => {
    const view = toPublicTrip({ ...trip, showGuestNames: false, options: {}, guests })
    expect(view.guestNames).toBeNull()
  })

  it('shows names while guests choose rooms, so they can see who to share with', () => {
    const view = toPublicTrip({ ...trip, showGuestNames: false, guests })
    expect(view.guestNames).toEqual(['Jordan P.', 'Avery L.'])
  })

  it('shows no rooms when room choice is off', () => {
    const rooms = [
      {
        id: 'r1',
        tripId: 't1',
        position: 0,
        name: 'Bunk room',
        beds: '',
        capacity: 4,
        weight: 1,
        bedTypes: [],
        minPeople: 1,
        priceCents: null,
      },
    ]
    const view = toPublicTrip({ ...trip, options: { vendorCosts: true }, guests, rooms })
    expect(view.rooms).toEqual([])
    expect(view.options).toEqual({ roomChoice: false, roomRequired: false, signupNote: '' })
  })
})

describe('shortName', () => {
  it('keeps the first name and the last initial', () => {
    expect(shortName('Jordan', 'price')).toBe('Jordan P.')
    expect(shortName('Cher', '')).toBe('Cher')
  })
})
