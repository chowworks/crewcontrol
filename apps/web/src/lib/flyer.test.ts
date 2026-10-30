import type { PublicRoom, PublicTrip } from '@cc/types'
import { describe, expect, it } from 'vitest'
import { flyerFacts, pdfFromJpeg, qrModules } from './flyer'

const trip = (over: Partial<PublicTrip> = {}): PublicTrip =>
  ({
    slug: 'aruba-2028',
    name: 'Aruba 2028',
    destination: 'Palm Beach, Aruba',
    startDate: '2028-03-09',
    endDate: '2028-03-13',
    organizerName: 'Jordan Price',
    costPerPersonCents: 120000,
    highlights: [
      { title: 'Pool', detail: 'All day', icon: 'waves' },
      { title: '', detail: 'Left blank', icon: 'star' },
      { title: 'Beach', detail: '', icon: 'sun' },
      { title: 'Dinner', detail: 'Friday', icon: 'utensils' },
      { title: 'Boat', detail: 'Saturday', icon: 'star' },
    ],
    rooms: [],
    ...over,
  }) as PublicTrip

const room = (priceCents: number) => ({ priceCents }) as PublicRoom

describe('flyerFacts', () => {
  it('says the trip, its price per person and its link', () => {
    const facts = flyerFacts(trip(), 'https://travel-hq.app')
    expect(facts).toMatchObject({
      name: 'Aruba 2028',
      dates: 'March 9–13, 2028',
      price: '$1,200 per person',
      host: 'Jordan Price',
      url: 'https://travel-hq.app/t/aruba-2028',
      link: 'travel-hq.app/t/aruba-2028',
    })
  })

  it('keeps every highlight that has a title', () => {
    const titles = flyerFacts(trip(), 'https://x').highlights.map((h) => h.title)
    expect(titles).toEqual(['Pool', 'Beach', 'Dinner', 'Boat'])
  })

  it('quotes the cheapest room, "From", when rooms are priced apart', () => {
    const facts = flyerFacts(trip({ rooms: [room(150000), room(90000)] }), 'https://x')
    expect(facts.price).toBe('From $900 per person')
  })
})

describe('qrModules', () => {
  it('makes a square code', () => {
    const modules = qrModules('https://travel-hq.app/t/aruba-2028')
    expect(modules.length).toBeGreaterThanOrEqual(21)
    expect(modules.every((row) => row.length === modules.length)).toBe(true)
  })
})

describe('pdfFromJpeg', () => {
  it('points its cross-reference table at each object', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const blob = pdfFromJpeg(jpeg, { width: 2550, height: 3300 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    const xref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(5)
    offsets.forEach((at, i) => expect(text.slice(at).startsWith(`${i + 1} 0 obj`)).toBe(true))
    expect(text).toContain('/Width 2550 /Height 3300')
  })
})
