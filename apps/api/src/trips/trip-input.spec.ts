import { BadRequestException } from '@nestjs/common'
import {
  parseExpense,
  parsePaymentDecision,
  parsePaymentReport,
  parseTripInput,
  parseTripPerson,
} from './trip-input'

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

describe('trip options', () => {
  it('defaults every option when none are sent', () => {
    expect(parseTripInput(valid).options).toEqual({
      roomChoice: false,
      roomRequired: false,
      signupNote: '',
      vendorCosts: false,
    })
  })

  it('keeps known options, drops unknown ones, and requires a room only with room choice', () => {
    const options = { roomChoice: false, roomRequired: true, signupNote: ' Bring a towel ', x: 1 }
    expect(parseTripInput({ ...valid, options }).options).toEqual({
      roomChoice: false,
      roomRequired: false,
      signupNote: 'Bring a towel',
      vendorCosts: false,
    })
  })

  it.each([
    ['a non-object', 'yes'],
    ['a non-boolean flag', { roomChoice: 'on' }],
  ])('rejects %s', (_label, options) => {
    expect(() => parseTripInput({ ...valid, options })).toThrow(BadRequestException)
  })
})

describe('payments', () => {
  it('keeps payment methods: a fixed kind needs its handle, a custom one its name', () => {
    const methods = [
      { kind: 'cashapp', label: 'ignored', handle: ' $nia ' },
      { kind: 'custom', label: 'Pay in person', handle: '' },
    ]
    expect(parseTripInput({ ...valid, paymentMethods: methods }).paymentMethods).toEqual([
      { kind: 'cashapp', label: '', handle: '$nia' },
      { kind: 'custom', label: 'Pay in person', handle: '' },
    ])
    for (const bad of [
      { kind: 'zelle', label: '', handle: '' },
      { kind: 'custom', label: '', handle: 'cash' },
      { kind: 'wire', label: '', handle: 'x' },
    ])
      expect(() => parseTripInput({ ...valid, paymentMethods: [bad] })).toThrow(BadRequestException)
  })

  it('takes a payment report only when the guest certifies it', () => {
    const report = { guestPaymentAmount: 50000, methodIndex: 0, sentOn: '2026-10-24', note: ' ' }
    expect(() => parsePaymentReport(report)).toThrow(/I sent this payment/)
    expect(parsePaymentReport({ ...report, certified: true })).toEqual({
      ...report,
      note: '',
      certified: true,
    })
    expect(() => parsePaymentReport({ ...report, certified: true, guestPaymentAmount: 0 })).toThrow(
      BadRequestException
    )
  })

  it('reads who one payment covers, with each one’s share', () => {
    const report = {
      guestPaymentAmount: 60000,
      methodIndex: 0,
      sentOn: '2026-10-24',
      note: '',
      certified: true,
    }
    const forGuests = [
      { guestId: 'g1', amount: 30000 },
      { guestId: 'g2', amount: 30000 },
    ]
    expect(parsePaymentReport({ ...report, forGuests })).toEqual({ ...report, forGuests })
    for (const bad of [[], [{ guestId: '', amount: 1 }], [{ guestId: 'g1', amount: 0 }], 'g1'])
      expect(() => parsePaymentReport({ ...report, forGuests: bad })).toThrow(BadRequestException)
  })

  it('reads a decision, with what arrived only on a confirmation', () => {
    expect(parsePaymentDecision({ status: 'confirmed' })).toEqual({ status: 'confirmed' })
    expect(parsePaymentDecision({ status: 'confirmed', receivedPaymentAmount: 450 })).toEqual({
      status: 'confirmed',
      receivedPaymentAmount: 450,
    })
    expect(parsePaymentDecision({ status: 'not_received', receivedPaymentAmount: 450 })).toEqual({
      status: 'not_received',
    })
    expect(() => parsePaymentDecision({ status: 'refunded' })).toThrow(BadRequestException)
    // A transfer for several travelers: what arrived for each.
    const shares = [{ paymentId: 'p1', receivedPaymentAmount: 300 }]
    expect(parsePaymentDecision({ status: 'confirmed', shares })).toEqual({
      status: 'confirmed',
      shares,
    })
    for (const bad of [[], [{ paymentId: '', receivedPaymentAmount: 1 }], [{ paymentId: 'p1' }]])
      expect(() => parsePaymentDecision({ status: 'confirmed', shares: bad })).toThrow(
        BadRequestException
      )
    // Nothing arrived is "not received", not a confirmation of $0.
    expect(() => parsePaymentDecision({ status: 'confirmed', receivedPaymentAmount: 0 })).toThrow(
      BadRequestException
    )
  })
})

describe('parseTripPerson', () => {
  it('takes an email and a role, the email lowercased', () => {
    expect(parseTripPerson({ email: ' Dana@Example.com ', role: 'owner' })).toEqual({
      email: 'dana@example.com',
      role: 'owner',
    })
  })

  it('refuses a missing email, a non-email and an unknown role', () => {
    expect(() => parseTripPerson({ email: '', role: 'organizer' })).toThrow(BadRequestException)
    expect(() => parseTripPerson({ email: 'dana', role: 'organizer' })).toThrow(BadRequestException)
    expect(() => parseTripPerson({ email: 'dana@example.com', role: 'admin' })).toThrow(
      BadRequestException
    )
  })
})

describe('parseExpense', () => {
  it('takes a payee, amount and either date, an empty date as none', () => {
    expect(
      parseExpense({
        payee: ' Seaside Rentals ',
        description: 'House deposit',
        amountCents: 250000,
        paidOn: '2026-11-02',
        dueOn: '',
      })
    ).toEqual({
      payee: 'Seaside Rentals',
      description: 'House deposit',
      amountCents: 250000,
      paidOn: '2026-11-02',
      dueOn: null,
    })
    expect(
      parseExpense({ payee: 'Chef', description: '', amountCents: 90000, paidOn: null })
    ).toEqual({ payee: 'Chef', description: '', amountCents: 90000, paidOn: null, dueOn: null })
  })

  it('refuses no payee, no amount and a date that is not one', () => {
    const ok = { payee: 'Chef', description: '', amountCents: 100, paidOn: null, dueOn: null }
    expect(() => parseExpense({ ...ok, payee: ' ' })).toThrow(BadRequestException)
    expect(() => parseExpense({ ...ok, amountCents: 0 })).toThrow(BadRequestException)
    expect(() => parseExpense({ ...ok, dueOn: 'March' })).toThrow(BadRequestException)
  })
})
