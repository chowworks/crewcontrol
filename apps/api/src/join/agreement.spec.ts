import {
  agreementPreview,
  agreementText,
  firstInstallmentCents,
  hashOf,
  termsOf,
} from './agreement'
import { toE164 } from './send-text'

const trip = {
  name: 'MV Beach House 2027',
  destination: "Martha's Vineyard, MA",
  startDate: '2027-06-18',
  endDate: '2027-06-21',
  organizerName: 'Chris',
  costPerPersonCents: 120000,
  installmentCount: 4,
  joinMode: 'pay_first',
}

describe('the trip agreement', () => {
  it("fills in the trip's own facts and the refund promise", () => {
    const text = agreementText(trip)
    expect(text).toContain('MV Beach House 2027')
    expect(text).toContain('2027-06-18 to 2027-06-21')
    expect(text).toContain('$1,200 per person, paid in 4 installments, the first of $300')
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

  it('says how spots go on a first come, first served trip', () => {
    expect(agreementText({ ...trip, joinMode: 'first_come' })).toContain(
      'first come, first served, in the order Chris confirms payments arrived'
    )
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

  it('takes the balance from what they signed, less the payment the organizer confirmed', () => {
    expect(termsOf(sig, null)).toMatchObject({ firstInstallmentCents: 30000, balanceCents: 120000 })
    expect(termsOf(sig, new Date())).toMatchObject({ balanceCents: 90000 })
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
