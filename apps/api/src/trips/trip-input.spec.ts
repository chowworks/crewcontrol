import { BadRequestException } from '@nestjs/common'
import { parseTripInput } from './trip-input'

const valid = {
  name: ' Aruba 2028 ',
  destination: 'Palm Beach, Aruba',
  startDate: '2028-04-13',
  endDate: '2028-04-18',
  organizerName: 'Nia',
  description: '',
  costPerPersonCents: 240000,
  installmentCount: 8,
  galleryTitle: '',
  showGuestNames: false,
  paymentInstructions: '',
  published: true,
  photos: [{ url: 'https://example.com/a.jpg', caption: '' }],
  highlights: [{ title: 'All-inclusive', detail: '', icon: 'hotel' }],
  keyDates: [
    { date: '2028-03-01', label: 'Final payment' },
    { date: '2027-11-01', label: 'First installment' },
  ],
}

describe('parseTripInput', () => {
  it('trims text, defaults the gallery title and sorts key dates', () => {
    const input = parseTripInput(valid)
    expect(input.name).toBe('Aruba 2028')
    expect(input.galleryTitle).toBe('Photos')
    expect(input.keyDates.map((d) => d.date)).toEqual(['2027-11-01', '2028-03-01'])
  })

  it.each([
    ['an end before the start', { endDate: '2028-04-01' }],
    ['a missing name', { name: '  ' }],
    ['an unknown icon', { highlights: [{ title: 'x', detail: '', icon: 'rocket' }] }],
    [
      'too many photos',
      { photos: Array.from({ length: 16 }, () => ({ url: '/a.jpg', caption: '' })) },
    ],
    ['a photo URL that is not a link', { photos: [{ url: 'javascript:alert(1)', caption: '' }] }],
    ['a protocol-relative photo URL', { photos: [{ url: '//evil.example/a.jpg', caption: '' }] }],
    ['a fractional price', { costPerPersonCents: 12.5 }],
  ])('rejects %s', (_label, patch) => {
    expect(() => parseTripInput({ ...valid, ...patch })).toThrow(BadRequestException)
  })
})
