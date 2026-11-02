import {
  agreementPreview,
  agreementText,
  firstInstallmentCents,
  hashOf,
  organizerTerms,
  termsOf,
} from './agreement'
import { fillAgreementNames, paymentPlan } from '../trips/trip-types'
import { toE164 } from './send-text'

const trip = {
  name: 'MV Beach House 2027',
  destination: "Martha's Vineyard, MA",
  startDate: '2027-06-18',
  endDate: '2027-06-21',
  organizerName: 'Chris',
  organizers: [{ name: 'Chris Avery', email: 'chris@example.com' }],
  costPerPersonCents: 120000,
  installmentCount: 4,
  paymentPlan: paymentPlan(120000, 4, null, []),
  joinMode: 'pay_first',
  refundPolicy: 'spot_filled',
}

describe('the trip agreement', () => {
  it("fills in the trip's own facts and the refund promise", () => {
    const text = agreementText(trip)
    expect(text).toContain('MV Beach House 2027')
    expect(text).toContain('2027-06-18 to 2027-06-21')
    expect(text).toContain(
      '$1,200 per person, paid in 4 installments: $300, $300, $300 and $300. You pay Chris directly'
    )
    expect(text).toContain('Chris refunds everything you paid, in full')
    expect(text).toContain('Chris accepts who comes')
    expect(text).toContain('You can ask Chris for a paper copy instead')
  })

  it('on an accept-first trip, says the guest pays only once accepted', () => {
    const text = agreementText({ ...trip, joinMode: 'accept_first' })
    expect(text).toContain(
      'Signing does not guarantee a spot: Chris accepts who comes. Once Chris accepts you'
    )
    expect(text).toContain('You pay nothing until Chris accepts you')
    expect(text).not.toContain('by the time your payment is confirmed')
  })

  it('words the refund policy the organizer picked', () => {
    expect(agreementText(trip)).toContain(
      "If you drop out after you're accepted, money you paid comes back only if Chris fills your spot"
    )
    const kept = agreementText({ ...trip, refundPolicy: 'first_payment_kept' })
    expect(kept).toContain("your deposit, the first payment ($300), isn't refunded")
    expect(kept).toContain('Money you paid after it comes back only if Chris fills your spot')
    // Turned down or removed: a full refund, whatever the policy.
    expect(kept).toContain('Chris refunds everything you paid, in full')
    expect(kept).toContain('If Chris removes you from the trip, Chris refunds everything you paid')
    expect(agreementPreview({ ...trip, refundPolicy: 'first_payment_kept' }).textHash).not.toBe(
      agreementPreview(trip).textHash
    )
  })

  it('makes every promise the organizer’s, and Travel HQ no party to it', () => {
    const text = agreementText(trip)
    expect(text).toContain(
      'This agreement is between you, the guest, and Chris Avery (chris@example.com), who organizes MV Beach House 2027.'
    )
    expect(text).toContain("Every promise in it is Chris's.")
    expect(text).toContain('it is not a party to this agreement')
    expect(text).toContain(
      "is not responsible for what Chris promises here or does or doesn't deliver"
    )
    expect(text).toContain("that is Chris's receipt, not Travel HQ's")
    // Which refund terms the organizer chose, and which every trip has.
    expect(text).toContain('Chris chose this for the trip: If you drop out')
    expect(text).toContain(
      'Every trip run on Travel HQ also has these terms, and Chris agreed to them'
    )
    // When a refund is sent is between the organizer and the guest (owner's decision, 2026-10-29).
    expect(text).not.toMatch(/within \d+ days/)
    expect(text).not.toContain('not a travel company')
  })

  it('calls one organizer by their own first name, never the trip page’s host name', () => {
    // A trip run from Chris's account for Derrell once read "Chris Howard ("Derrell", …)".
    const text = agreementText({ ...trip, organizerName: 'Derrell' })
    expect(text).toContain(
      'between you, the guest, and Chris Avery (chris@example.com), who organizes'
    )
    expect(text).toContain('Trip agreement between you and Chris\n')
    expect(text).not.toContain('Derrell')
  })

  it('names everyone who runs the trip, and words every promise as theirs together', () => {
    const text = agreementText({
      ...trip,
      organizerName: 'Derrell',
      organizers: [
        { name: 'Derrell Jones', email: 'derrell@example.com' },
        { name: 'Chris Avery', email: 'chris@example.com' },
      ],
    })
    expect(text).toContain('Trip agreement between you and Derrell and Chris\n')
    expect(text).toContain(
      'between you, the guest, and Derrell Jones (derrell@example.com) and Chris Avery (chris@example.com), who ' +
        'organize MV Beach House 2027 ("the organizers"). Every promise in it is the organizers\'.'
    )
    expect(text).toContain("what the organizers promise here or do or don't deliver")
    expect(text).toContain("The organizers can change the trip's details")
    expect(text).toContain('You pay the organizers directly')
    expect(text).toContain("4. The organizers' refund terms")
    expect(text).toContain('The organizers chose this for the trip')
    expect(text).toContain('the organizers refund everything you paid, in full')
    expect(text).toContain(
      'If the organizers remove you from the trip, the organizers refund everything'
    )
    expect(text).toContain('the organizers accept who comes')
    // No singular verb left behind after "the organizers".
    expect(
      text.match(/the organizers (\w+)/gi)?.filter((m) => /s$/.test(m) && !/'s$/.test(m))
    ).toEqual([])
  })

  it('names three organizers as a list', () => {
    const text = agreementText({
      ...trip,
      organizers: [
        { name: 'Ana Ruiz', email: 'ana@example.com' },
        { name: 'Ben Ode', email: 'ben@example.com' },
        { name: 'Cy Park', email: 'cy@example.com' },
      ],
    })
    expect(text).toContain(
      'Ana Ruiz (ana@example.com), Ben Ode (ben@example.com) and Cy Park (cy@example.com), who organize'
    )
    expect(text).toContain('Trip agreement between you and Ana, Ben and Cy\n')
  })

  it('says "the organizer" when sign-in has no name, beside their email', () => {
    const text = agreementText({ ...trip, organizers: [{ name: '', email: 'chris@example.com' }] })
    expect(text).toContain('between you, the guest, and chris@example.com, who organizes')
    expect(text).toContain('The organizer can change')
  })

  it('names the organizer by the trip page’s name alone on a trip with no one on it', () => {
    const text = agreementText({ ...trip, organizers: [] })
    expect(text).toContain('between you, the guest, and Chris, who organizes')
    expect(agreementPreview({ ...trip, organizers: [] }).textHash).not.toBe(
      agreementPreview(trip).textHash
    )
  })

  it('refunds what can be recovered when the trip changes or is cancelled, not a full refund', () => {
    const text = agreementText(trip)
    expect(text).toContain('5. If the trip changes or is cancelled')
    expect(text).toContain(
      "Chris refunds what you paid, less any money Chris already spent on the trip and can't get back"
    )
    expect(text).not.toContain('for a full refund of what you paid')
    expect(text).toContain('6. Signing')
  })

  it('says how spots go on a first come, first served trip', () => {
    expect(agreementText({ ...trip, joinMode: 'first_come' })).toContain(
      'first come, first served, in the order Chris confirms payments arrived'
    )
  })

  it('says once, at the top, when someone signs it for a traveler they look after', () => {
    const own = agreementText(trip)
    const forThem = agreementText(trip, true)
    expect(own).not.toContain('on behalf of')
    expect(fillAgreementNames(forThem, ' Dana  Reyes', 'Ava Reyes').split('\n\n')[1]).toContain(
      'Dana Reyes signs it on behalf of Ava Reyes, the traveler'
    )
    // Before the names are typed, the screen shows where they go.
    expect(fillAgreementNames(forThem, '', '')).toContain(
      '[your full name] signs it on behalf of [their full name]'
    )
    // Only the opening changes.
    expect(forThem.split('\n\n').slice(2)).toEqual(own.split('\n\n').slice(2))
    expect(agreementPreview(trip, true).textHash).not.toBe(agreementPreview(trip).textHash)
  })

  it('has a fingerprint that changes whenever a fact it quotes does', () => {
    const a = agreementPreview(trip)
    expect(a.textHash).toBe(hashOf(a.text))
    expect(a.textHash).toMatch(/^[0-9a-f]{64}$/)
    expect(agreementPreview(trip).textHash).toBe(a.textHash)
    expect(agreementPreview({ ...trip, costPerPersonCents: 130000 }).textHash).not.toBe(a.textHash)
    expect(agreementPreview({ ...trip, joinMode: 'first_come' }).textHash).not.toBe(a.textHash)
    expect(agreementPreview({ ...trip, joinMode: 'accept_first' }).textHash).not.toBe(a.textHash)
  })
})

describe('a guest’s terms', () => {
  const sig = {
    priceCents: 120000,
    installmentCount: 4,
    startDate: '2027-06-18',
    endDate: '2027-06-21',
    refundTerms: 'r',
  }

  it('gives an organizer going on their own trip a $0 price: they owe the charges added, less what they paid (issue #53)', () => {
    const dates = { startDate: '2027-06-18', endDate: '2027-06-21' }
    expect(organizerTerms(dates, [])).toMatchObject({ priceCents: 0, balanceCents: 0 })
    const charge = { kind: 'charge' as const, amountCents: 23500, removedAt: null }
    const paid = {
      status: 'confirmed' as const,
      guestPaymentAmount: 10000,
      receivedPaymentAmount: 10000,
    }
    expect(organizerTerms(dates, [paid], [charge])).toMatchObject({
      adjustmentCents: 23500,
      paidCents: 10000,
      balanceCents: 13500,
    })
  })

  it('counts what an organizer puts in on an even split as their price, already paid', () => {
    const dates = { startDate: '2027-06-18', endDate: '2027-06-21' }
    expect(organizerTerms(dates, [], [], 50000)).toMatchObject({
      priceCents: 50000,
      paidCents: 50000,
      balanceCents: 0,
    })
  })

  it('takes the balance from what they signed, less the payments the organizer confirmed', () => {
    const pay = (
      status: 'reported' | 'confirmed' | 'refunded',
      sent: number,
      received: number | null
    ) => ({
      status,
      guestPaymentAmount: sent,
      receivedPaymentAmount: received,
    })
    expect(termsOf(sig, [])).toMatchObject({ firstInstallmentCents: 30000, balanceCents: 120000 })
    expect(
      termsOf(sig, [
        pay('confirmed', 30000, 25000),
        pay('reported', 5000, null),
        pay('refunded', 9, 9),
      ])
    ).toMatchObject({ paidCents: 25000, pendingCents: 5000, balanceCents: 95000 })
  })

  it('counts the adjustments that still stand beside the signed price, never in it', () => {
    const adj = (
      kind: 'credit' | 'charge',
      amountCents: number,
      removedAt: string | null = null
    ) => ({
      kind,
      amountCents,
      removedAt,
    })
    const paid = [
      { status: 'confirmed' as const, guestPaymentAmount: 30000, receivedPaymentAmount: 30000 },
    ]
    expect(
      termsOf(sig, paid, [adj('credit', 5000), adj('charge', 4000), adj('charge', 9999, 'x')])
    ).toMatchObject({ priceCents: 120000, adjustmentCents: -1000, balanceCents: 89000 })
  })

  it('quotes the payment plan the trip editor set: each amount and its due date', () => {
    const plan = paymentPlan(120000, 3, 50000, ['2027-01-15', '2027-03-15', '2027-05-15'])
    const text = agreementText({ ...trip, installmentCount: 3, paymentPlan: plan })
    expect(text).toContain(
      'paid in 3 installments: $500 due by 2027-01-15, $350 due by 2027-03-15 and $350 due by 2027-05-15'
    )
    // The first payment the refund terms name is the plan's.
    expect(
      agreementText({ ...trip, refundPolicy: 'first_payment_kept', paymentPlan: plan })
    ).toContain("your deposit, the first payment ($500), isn't refunded")
    expect(agreementPreview({ ...trip, paymentPlan: plan }).textHash).not.toBe(
      agreementPreview(trip).textHash
    )
    expect(
      agreementText({
        ...trip,
        installmentCount: 1,
        paymentPlan: paymentPlan(120000, 1, null, ['2027-01-15']),
      })
    ).toContain('paid in one payment of $1,200 due by 2027-01-15')
  })

  it('takes a guest’s first payment from the plan they signed, or the even split from before plans', () => {
    const schedule = paymentPlan(120000, 4, 50000, [])
    expect(termsOf({ ...sig, schedule }, []).firstInstallmentCents).toBe(50000)
    expect(termsOf({ ...sig, schedule }, []).schedule).toEqual(schedule)
    expect(termsOf({ ...sig, schedule: [] }, []).schedule).toEqual(paymentPlan(120000, 4, null, []))
  })

  it('puts odd cents on the last installment, and one payment is the whole price', () => {
    expect(firstInstallmentCents(100000, 3)).toBe(33333)
    expect(firstInstallmentCents(100000, 1)).toBe(100000)
  })
})

describe('toE164', () => {
  it('reads US numbers as typed, and refuses what it cannot text', () => {
    expect(toE164('(555) 555-0100')).toBe('+15555550100')
    expect(toE164('1 555 555 0100')).toBe('+15555550100')
    expect(toE164('+44 20 7946 0000')).toBe('+442079460000')
    expect(toE164('555-0100')).toBeNull()
  })
})
