import { BadRequestException } from '@nestjs/common'
import { parseInterest } from './interest.controller'

// What "I'm interested" accepts: a name and a phone number the organizer can text.
describe('parseInterest', () => {
  it('trims the name and phone', () => {
    expect(parseInterest({ name: '  Ava   Reyes ', phone: ' (555) 010-0101 ' })).toEqual({
      name: 'Ava Reyes',
      phone: '(555) 010-0101',
    })
  })
  it('needs a name and a phone number', () => {
    expect(() => parseInterest({ name: '', phone: '5550100101' })).toThrow(BadRequestException)
    expect(() => parseInterest({ name: 'Ava', phone: '12' })).toThrow(/phone number/)
    expect(() => parseInterest(null)).toThrow(/Add your name/)
  })
})
