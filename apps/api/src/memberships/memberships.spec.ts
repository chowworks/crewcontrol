import { BadRequestException } from '@nestjs/common'
import { parseOrganizerRequest } from '../trips/trip-input'
import { parseMemberEmail, parseMembership } from './membership-input'
import { activeFeatures, hasEnded, today } from './memberships.service'

const at = (iso: string) => new Date(iso)

describe('paid features', () => {
  it('stay on through their last day in Eastern time, then switch off', () => {
    // 11:30 PM Eastern on Nov 15 is already Nov 16 in UTC.
    const lateEvening = at('2026-11-16T04:30:00Z')
    expect(today(lateEvening)).toBe('2026-11-15')
    expect(hasEnded('2026-11-15', lateEvening)).toBe(false)
    expect(hasEnded('2026-11-14', lateEvening)).toBe(true)
    expect(hasEnded(null, lateEvening)).toBe(false)
  })

  it('add up across a person’s memberships, leaving out ended ones', () => {
    const now = at('2026-11-15T15:00:00Z')
    const on = activeFeatures(
      [
        { features: ['custom_domain'], endsOn: at('2026-11-01T00:00:00Z') },
        { features: ['organizer_link'], endsOn: null },
      ],
      now
    )
    expect([...on]).toEqual(['organizer_link'])
  })

  it('take the admin’s ticks, an optional last day and a note', () => {
    expect(
      parseMembership({
        features: ['custom_domain', 'custom_domain'],
        endsOn: '2027-11-15',
        note: '  Paid $40 by Zelle  ',
      })
    ).toEqual({ features: ['custom_domain'], endsOn: '2027-11-15', note: 'Paid $40 by Zelle' })
    expect(parseMembership({ features: ['organizer_link'] })).toEqual({
      features: ['organizer_link'],
      endsOn: null,
      note: '',
    })
    for (const bad of [
      { features: [] },
      { features: ['free_lunch'] },
      { features: ['custom_domain'], endsOn: '2027-02-30' },
      { features: ['custom_domain'], note: 'x'.repeat(2001) },
    ])
      expect(() => parseMembership(bad)).toThrow(BadRequestException)
  })

  it('keep emails lowercased', () => {
    expect(parseMemberEmail(' Dana@Example.com ')).toBe('dana@example.com')
    expect(() => parseMemberEmail('dana')).toThrow(BadRequestException)
  })

  it('can be asked for by name, with or without a reason', () => {
    expect(parseOrganizerRequest({ kind: 'feature_access', feature: 'custom_domain' })).toEqual({
      kind: 'feature_access',
      feature: 'custom_domain',
      text: '',
    })
    expect(() => parseOrganizerRequest({ kind: 'feature_access', feature: 'x' })).toThrow(
      BadRequestException
    )
  })
})
