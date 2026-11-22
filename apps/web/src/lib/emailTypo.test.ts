import { describe, expect, it } from 'vitest'
import { suggestEmail } from './emailTypo'

describe('suggestEmail', () => {
  it('catches a common domain typed a little wrong', () => {
    expect(suggestEmail('maya@gmial.com')).toBe('maya@gmail.com')
    expect(suggestEmail('maya@gmail.con')).toBe('maya@gmail.com')
    expect(suggestEmail('maya@yaho.com')).toBe('maya@yahoo.com')
    expect(suggestEmail('maya@hotmial.com')).toBe('maya@hotmail.com')
  })

  it('leaves a correct or unknown domain alone', () => {
    expect(suggestEmail('maya@gmail.com')).toBeNull()
    expect(suggestEmail('maya@example.com')).toBeNull()
    expect(suggestEmail('maya@travel-hq.app')).toBeNull()
    expect(suggestEmail('maya')).toBeNull()
    expect(suggestEmail('maya@')).toBeNull()
  })

  it('leaves real domains a letter away from a common one alone', () => {
    for (const d of [
      'ymail.com',
      'mail.com',
      'email.com',
      'aim.com',
      'mac.com',
      'yahoo.ca',
      'live.ca',
      'ge.com',
      'ibm.com',
    ])
      expect(suggestEmail(`maya@${d}`)).toBeNull()
  })

  it('fixes a wrong ending on a common domain', () => {
    expect(suggestEmail('maya@aol.cm')).toBe('maya@aol.com')
    expect(suggestEmail('maya@comcast.nte')).toBe('maya@comcast.net')
  })
})
