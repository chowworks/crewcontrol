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
  paymentPlan: [],
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
      schedule: [],
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

  it('says when the plan starts with a deposit, and whether the trip keeps it', () => {
    const schedule = [
      { dueOn: null, amountCents: 30000 },
      { dueOn: null, amountCents: 45000 },
      { dueOn: null, amountCents: 45000 },
    ]
    const withDeposit = me({ terms: { ...me({}).terms!, schedule } })
    const kept = { ...trip, refundPolicy: 'first_payment_kept' } as unknown as PublicTrip
    expect(guestEmailContext(view(withDeposit), contact, '').paymentDetails).toMatchObject({
      deposit: true,
      depositKept: false,
    })
    expect(
      guestEmailContext(
        { trip: { ...kept, joinMode: 'accept_first' }, me: withDeposit } as never,
        contact,
        ''
      ).paymentDetails
    ).toMatchObject({ deposit: true, depositKept: true })
    expect(guestEmailContext(view(me({})), contact, '').paymentDetails?.deposit).toBe(false)
  })

  it('lists the plan with its due dates, from the trip when the guest signed before it had any', () => {
    const undated = [
      { dueOn: null, amountCents: 40000 },
      { dueOn: null, amountCents: 40000 },
      { dueOn: null, amountCents: 40000 },
    ]
    const guest = me({ terms: { ...me({}).terms!, schedule: undated } })
    const dates = ['2027-11-15', '2027-12-15', '2028-01-15']
    const tripPlan = dates.map((dueOn) => ({ dueOn, amountCents: 40000 }))
    const dated = guestEmailContext(
      { trip: { ...trip, paymentPlan: tripPlan }, me: guest } as unknown as JoinView,
      contact,
      ''
    ).paymentDetails
    expect(dated).toMatchObject({
      firstDue: 'Nov 15, 2027',
      onePayment: false,
      datesSet: true,
      plan: [
        { date: 'Nov 15, 2027', amount: '$400' },
        { date: 'Dec 15, 2027', amount: '$400' },
        { date: 'Jan 15, 2028', amount: '$400' },
      ],
    })
    // Trip Control's data has the dates as a list.
    const organizerTrip = { ...trip } as Partial<PublicTrip>
    delete organizerTrip.paymentPlan
    expect(
      guestEmailContext(
        { trip: { ...organizerTrip, paymentDueDates: dates }, me: guest } as never,
        contact,
        ''
      ).paymentDetails?.firstDue
    ).toBe('Nov 15, 2027')
    // No dates anywhere: said plainly, never made up.
    expect(guestEmailContext(view(guest), contact, '').paymentDetails).toMatchObject({
      firstDue: '',
      datesSet: false,
      plan: [
        { date: '', amount: '$400' },
        { date: '', amount: '$400' },
        { date: '', amount: '$400' },
      ],
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
      'send Nia your deposit, $400, to save your spot, one of these ways'
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

  it('tells someone added to a trip how to get in, with or without an account', () => {
    const invite = EMAIL_KINDS.find((k) => k.kind === 'invite')!
    const ctx = sampleFor(invite, 'can_pay')
    const fresh = render(invite, ctx)
    expect(fresh.subject).toBe(
      '[Travel HQ] Nia Brooks added you to help run Aruba Crew Getaway 2028'
    )
    expect(fresh.text).toContain('as an organizer of Aruba Crew Getaway 2028, Mar 3 – 8, 2028')
    expect(fresh.text).toContain('dana.reyes@example.com')
    expect(fresh.text).toContain('Make your account (https://travel-hq.app/sign-up)')
    expect(fresh.text).toContain(
      'Nia Brooks added you to help run Aruba Crew Getaway 2028 on Travel HQ'
    )
    expect(fresh.text).not.toContain('trip agreement')
    const link = 'https://travel-hq.app/organize/t1/control'
    const owner = render(invite, {
      invite: { ...ctx.invite!, signedUp: true, isOwner: true, role: 'owner', link },
    })
    expect(owner.text).toContain('as an owner of')
    expect(owner.text).toContain(`Open the trip (${link})`)
    expect(owner.text).not.toContain('Make your account')
  })
})
