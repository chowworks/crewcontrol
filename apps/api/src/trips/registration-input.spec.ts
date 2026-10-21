import { BadRequestException } from '@nestjs/common'
import { parseRegistration, parseTripInput, splitName } from './trip-input'

const ok = { name: 'Jordan Price', phone: '(555) 555-0100', email: 'Jordan@Example.com' }

describe('parseRegistration', () => {
  it('accepts a sign-up and lowercases the email', () => {
    expect(parseRegistration({ ...ok, paymentSent: true })).toEqual({
      ...ok,
      email: 'jordan@example.com',
      paymentSent: true,
      roomId: null,
      roomNote: '',
    })
  })

  it.each([
    [{ ...ok, phone: '123' }, 'Phone must be a phone number'],
    [{ ...ok, email: 'nope' }, 'Email must be an email address'],
    [{ ...ok, name: '' }, 'name is required'],
  ])('rejects %o', (body, message) => {
    expect(() => parseRegistration(body)).toThrow(new BadRequestException(message))
  })
})

describe('splitName', () => {
  it('keeps everything after the first word as the last name', () => {
    expect(splitName(' Mary Ann  de Souza ')).toEqual(['Mary', 'Ann de Souza'])
    expect(splitName('Cher')).toEqual(['Cher', ''])
  })
})

describe('parseTripInput pay-first rule', () => {
  const trip = {
    name: 'Trip',
    destination: 'Somewhere',
    startDate: '2027-08-07',
    endDate: '2027-08-14',
    organizerName: 'Sam',
    description: '',
    costPerPersonCents: 100000,
    installmentCount: 4,
    galleryTitle: 'Photos',
    showGuestNames: false,
    paymentInstructions: '',
    published: true,
    photos: [],
    highlights: [],
    keyDates: [],
  }

  it('needs the refund pledge to turn on pay-first', () => {
    expect(() => parseTripInput({ ...trip, payFirst: true, refundPledge: false })).toThrow(
      BadRequestException
    )
    expect(
      parseTripInput({ ...trip, payFirst: true, refundPledge: true, maxGuests: 12 })
    ).toMatchObject({
      payFirst: true,
      maxGuests: 12,
    })
  })
})
