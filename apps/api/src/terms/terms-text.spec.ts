import { BadRequestException } from '@nestjs/common'
import { fingerprint, TERMS } from './terms-text'
import { acceptedKinds, parseAcceptTerms } from './terms.service'

const doc = {
  title: 'Terms of Use',
  sections: [{ heading: '1. One', body: 'Travel HQ never holds or moves money.' }],
}

describe('the Terms version', () => {
  it('is 16 hex characters of the wording', () => {
    expect(fingerprint(doc)).toMatch(/^[0-9a-f]{16}$/)
    expect(TERMS.use.version).toBe(fingerprint(TERMS.use))
    expect(TERMS.organizer.version).toBe(fingerprint(TERMS.organizer))
  })

  it('does not change when a line is re-wrapped', () => {
    const wrapped = {
      ...doc,
      sections: [{ heading: ' 1. One ', body: 'Travel HQ never holds\n   or moves  money.' }],
    }
    expect(fingerprint(wrapped)).toBe(fingerprint(doc))
  })

  it('changes when a word changes', () => {
    const changed = {
      ...doc,
      sections: [{ ...doc.sections[0], body: 'Travel HQ never holds money.' }],
    }
    expect(fingerprint(changed)).not.toBe(fingerprint(doc))
  })

  it('tells the two documents apart', () => {
    expect(TERMS.use.version).not.toBe(TERMS.organizer.version)
  })

  it('has the Organizer Terms say organizers are responsible for licensing where it is required', () => {
    expect(TERMS.organizer.sections.map((s) => s.heading)).toContain('4. Licenses and registration')
  })

  it('carries the trip agreement guests sign as an addendum, every version of it', () => {
    const text = TERMS.organizer.sections.map((s) => `${s.heading}\n${s.body}`).join('\n')
    expect(text).toContain('Addendum: the trip agreement your guests sign')
    expect(text).toContain('Agreement: 5. If the trip changes or is cancelled')
    expect(text).toContain('[your full name] ([your email])')
    // Both refund presets and every way in are spelled out.
    expect(text).toContain(
      'Keep the deposit: "If you drop out after you\'re accepted, your deposit, the first payment'
    )
    expect(text).toContain('Refund only if you fill their spot: "')
    expect(text).toContain(
      'Guests pay, then you accept or First come, first served: "If [organizer] does not'
    )
    expect(text).toContain('First come, first served: "Spots go first come')
    expect(text).toContain(
      'When someone signs for a traveler they look after, it adds after its first sentence'
    )
    expect(text).not.toContain('[[signer]]')
  })
})

describe('accepting the Terms', () => {
  it('takes the current versions only', () => {
    expect(acceptedKinds({ use: TERMS.use.version })).toEqual(['use'])
    expect(acceptedKinds({ use: TERMS.use.version, organizer: TERMS.organizer.version })).toEqual([
      'use',
      'organizer',
    ])
    expect(() => acceptedKinds({ use: 'old' })).toThrow(BadRequestException)
    expect(() => acceptedKinds({ use: TERMS.use.version, organizer: 'old' })).toThrow(
      BadRequestException
    )
  })

  it('reads the request', () => {
    expect(parseAcceptTerms({ use: 'a', organizer: 'b' })).toEqual({ use: 'a', organizer: 'b' })
    expect(parseAcceptTerms({ use: 'a' })).toEqual({ use: 'a' })
    expect(() => parseAcceptTerms({})).toThrow(BadRequestException)
    expect(() => parseAcceptTerms({ use: 'a', organizer: 1 })).toThrow(BadRequestException)
  })
})
