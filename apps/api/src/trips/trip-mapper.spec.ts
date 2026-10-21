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
  galleryTitle: 'The house',
  showGuestNames: true,
  paymentInstructions: 'Zelle Chris, memo MV2027',
  published: true,
  isSample: false,
  photos: [{ url: '/seed/mv-1.svg', caption: 'Front' }],
  highlights: [],
  keyDates: [],
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
})

const guests = [
  guest('g1', 'approved', 'Jordan', 'Price'),
  guest('g2', 'approved', 'Avery', 'Lane'),
  guest('g3', 'interested', 'Morgan', 'Reed'),
]

describe('toPublicTrip', () => {
  it('never exposes payment instructions or guest contact details', () => {
    const json = JSON.stringify(toPublicTrip({ ...trip, guests }))
    expect(json).not.toContain('Zelle')
    expect(json).not.toContain('@example.com')
    expect(json).not.toContain('555-0100')
  })

  it('names approved guests only, and counts the interested', () => {
    const view = toPublicTrip({ ...trip, guests })
    expect(view.guestNames).toEqual(['Jordan P.', 'Avery L.'])
    expect(view.goingCount).toBe(2)
    expect(view.interestedCount).toBe(1)
    expect(JSON.stringify(view)).not.toContain('Morgan')
  })

  it('hides names when the organizer turns them off', () => {
    expect(toPublicTrip({ ...trip, showGuestNames: false, guests }).guestNames).toBeNull()
  })
})

describe('shortName', () => {
  it('keeps the first name and the last initial', () => {
    expect(shortName('Jordan', 'price')).toBe('Jordan P.')
    expect(shortName('Cher', '')).toBe('Cher')
  })
})
