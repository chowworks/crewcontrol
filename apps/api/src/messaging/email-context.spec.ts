import type { JoinView, MyGuest, PublicTrip } from '../trips/trip-types'
import { dateRange, day, guestEmailContext } from './email-context'
import { EMAIL_KINDS, sampleContext, sampleFor } from './email-defaults'
import { checkTemplate, render } from './email-template'

const trip = {
  slug: 'aruba-2028',
  name: 'Aruba Crew Getaway 2028',
  destination: 'Aruba',
  startDate: '2028-03-03',
  endDate: '2028-03-08',
  organizerName: 'Nia',
  description: 'Resort week',
  costPerPersonCents: 120000,
  installmentCount: 3,
  highlights: [{ title: 'Beach', detail: 'Steps away', icon: 'beach' }],
  keyDates: [{ date: '2028-01-05', label: 'Final payment' }],
  rooms: [{ id: 'R1', name: 'Ocean view' }],
  joinMode: 'accept_first',
} as unknown as PublicTrip

const me = (over: Partial<MyGuest>): MyGuest =>
  ({
    status: 'interested',
    firstName: 'Dana',
    lastName: 'Reyes',
    waitlistedAt: null,
    offeredAt: null,
    roomId: 'R1',
    refundSentAt: null,
    terms: {
      priceCents: 120000,
      installmentCount: 3,
      firstInstallmentCents: 40000,
      paidCents: 10000,
      pendingCents: 0,
      adjustmentCents: 0,
      balanceCents: 110000,
    },
    paymentMethods: [],
    paymentInstructions: '',
    ...over,
  }) as MyGuest

const view = (m: MyGuest, joinMode = 'accept_first'): JoinView =>
  ({ trip: { ...trip, joinMode }, me: m }) as unknown as JoinView

const contact = {
  email: 'dana.reyes@example.com',
  phone: '(555) 010-0142',
  paymentMethods: [{ kind: 'zelle' as const, label: '', handle: '(555) 010-0199' }],
  paymentInstructions: 'Memo: Aruba',
}

describe('guestEmailContext', () => {
  it('writes out the trip and the guest', () => {
    const c = guestEmailContext(view(me({})), contact, 'https://travel-hq.app')
    expect(c.trip).toMatchObject({
      dates: 'Mar 3 – 8, 2028',
      pricePerPerson: '$1,200',
      joinLink: 'https://travel-hq.app/t/aruba-2028/join',
      keyDates: [{ date: 'Jan 5, 2028', label: 'Final payment' }],
    })
    expect(c.guest).toMatchObject({
      fullName: 'Dana Reyes',
      status: 'Signed',
      room: 'Ocean view',
      accepted: false,
    })
  })

  it('says whether the guest may pay now', () => {
    const can = (m: MyGuest, mode?: string) =>
      guestEmailContext(view(m, mode), contact, '').guest.canPay
    expect(can(me({}))).toBe(false)
    expect(can(me({}), 'pay_first')).toBe(true)
    expect(can(me({ waitlistedAt: '2026-10-28' }), 'pay_first')).toBe(false)
    expect(can(me({ status: 'declined' }), 'pay_first')).toBe(false)
    expect(can(me({ status: 'approved' }))).toBe(true)
  })

  it('always has the payment details, for the wording to show or not', () => {
    const c = guestEmailContext(view(me({})), contact, '')
    expect(c.paymentDetails).toMatchObject({
      methods: [{ name: 'Zelle', handle: '(555) 010-0199' }],
      oneMethod: true,
      instructions: 'Memo: Aruba',
      paid: '$100',
      dueNow: '$300',
      left: '$1,100',
      adjustments: '',
      total: '$1,200',
    })
  })

  it("counts the organizer's credits and charges in the total", () => {
    const terms = { ...me({}).terms!, adjustmentCents: -5000, balanceCents: 105000 }
    const c = guestEmailContext(view(me({ terms })), contact, '')
    expect(c.paymentDetails).toMatchObject({
      price: '$1,200',
      adjustments: '−$50',
      total: '$1,150',
      left: '$1,050',
    })
  })
})

it('writes dates and ranges', () => {
  expect(day('2027-06-12')).toBe('Jun 12, 2027')
  expect(dateRange('2027-06-28', '2027-07-03')).toBe('Jun 28 – Jul 3, 2027')
  expect(dateRange('2027-12-30', '2028-01-02')).toBe('Dec 30, 2027 – Jan 2, 2028')
})

describe('the default emails', () => {
  it.each(EMAIL_KINDS.map((k) => [k.kind, k]))('%s is a valid template', (_, k) => {
    expect(checkTemplate(k.subject, k.groups)).toEqual([])
    expect(checkTemplate(k.body, k.groups)).toEqual([])
  })

  it('tells each kind of guest the right next step', () => {
    const joined = EMAIL_KINDS.find((k) => k.kind === 'joined')!
    expect(render(joined, sampleContext('can_pay')).text).toContain(
      'send Nia $400 to hold your spot, one of these ways'
    )
    expect(render(joined, sampleContext('not_yet')).text).toContain("Once you're accepted")
    expect(render(joined, sampleContext('waitlisted')).text).toContain('on the waitlist')
    expect(render(joined, sampleContext('not_yet')).text).not.toContain('Zelle')
    expect(render(joined, sampleContext('waitlisted')).text).not.toContain('Zelle')
  })

  it('writes the contact form message with a reply button and keeps its line breaks', () => {
    const contact = EMAIL_KINDS.find((k) => k.kind === 'contact')!
    const out = render(contact, sampleFor(contact, 'can_pay'))
    expect(out.subject).toBe('[Travel HQ] Contact form: Help with a trip, from Dana Reyes')
    expect(out.text).toMatch(/^New message from Dana Reyes\n\nTopic: Help with a trip/)
    expect(out.html).toContain('href="mailto:dana.reyes@example.com"')
    expect(out.text).toContain('picked the wrong room.\nCan the organizer')
    expect(out.text).toContain('Sent from the contact form')
  })
})
