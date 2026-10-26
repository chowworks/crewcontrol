import { BadRequestException } from '@nestjs/common'
import { parseGuestUpdate, parseJoin, parseTripInput, splitName } from './trip-input'

const ok = {
  name: 'Jordan Price',
  phone: '(555) 555-0100',
  email: 'Jordan@Example.com',
  typedName: ' jordan  price ',
  agreed: true,
  agreementHash: 'a'.repeat(64),
}

describe('parseJoin', () => {
  it('accepts a join and its signature, and lowercases the email', () => {
    expect(parseJoin(ok)).toEqual({
      ...ok,
      email: 'jordan@example.com',
      typedName: 'jordan price',
      roomId: null,
      roomNote: '',
    })
  })

  it('keeps the Terms of Use version the guest ticked, when sent', () => {
    expect(parseJoin({ ...ok, termsVersion: 'abc123' }).termsVersion).toBe('abc123')
    expect(parseJoin(ok)).not.toHaveProperty('termsVersion')
  })

  it.each([
    [{ ...ok, phone: '123' }, 'Phone must be a phone number'],
    [{ ...ok, email: 'nope' }, 'Email must be an email address'],
    [{ ...ok, name: '' }, 'name is required'],
    [{ ...ok, typedName: 'J. Price' }, 'Type your full name exactly as you wrote it above'],
    [{ ...ok, agreed: false }, 'Tick “I agree” to sign'],
    [{ ...ok, agreed: 'yes' }, 'Tick “I agree” to sign'],
    [{ ...ok, agreementHash: undefined }, 'agreementHash must be text'],
    [{ ...ok, termsVersion: 7 }, 'termsVersion must be text'],
  ])('rejects %o', (body, message) => {
    expect(() => parseJoin(body)).toThrow(new BadRequestException(message))
  })
})

describe('splitName', () => {
  it('keeps everything after the first word as the last name', () => {
    expect(splitName(' Mary Ann  de Souza ')).toEqual(['Mary', 'Ann de Souza'])
    expect(splitName('Cher')).toEqual(['Cher', ''])
  })
})

describe('parseGuestUpdate', () => {
  it('takes turning a guest down with the refund sent', () => {
    expect(parseGuestUpdate({ status: 'declined', refundSent: true })).toEqual({
      status: 'declined',
      refundSent: true,
    })
    expect(() => parseGuestUpdate({ status: 'maybe' })).toThrow(BadRequestException)
  })
})

describe('parseTripInput join mode', () => {
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

  it('defaults to accepting before guests pay, and takes the other two modes', () => {
    expect(parseTripInput(trip).joinMode).toBe('accept_first')
    expect(parseTripInput({ ...trip, joinMode: 'pay_first' }).joinMode).toBe('pay_first')
    expect(parseTripInput({ ...trip, joinMode: 'first_come', maxGuests: 12 })).toMatchObject({
      joinMode: 'first_come',
      maxGuests: 12,
    })
    expect(() => parseTripInput({ ...trip, joinMode: 'lottery' })).toThrow(BadRequestException)
  })
})
