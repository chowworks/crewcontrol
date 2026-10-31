import { BadRequestException } from '@nestjs/common'
import { parseEarlyAccess } from './early-access-input'

describe('parseEarlyAccess', () => {
  it('takes a name and an email, lowercased, and an optional note', () => {
    expect(parseEarlyAccess({ name: ' Dana Reyes ', email: ' Dana@Example.com ' })).toEqual({
      name: 'Dana Reyes',
      email: 'dana@example.com',
      note: '',
      website: '',
    })
    expect(
      parseEarlyAccess({ name: 'Dana', email: 'dana@example.com', note: ' A reunion ' }).note
    ).toBe('A reunion')
  })

  it('refuses no name and an email that is not one', () => {
    expect(() => parseEarlyAccess({ name: ' ', email: 'dana@example.com' })).toThrow(
      BadRequestException
    )
    for (const email of [
      'dana',
      '@example.com',
      'dana@example',
      'dana@example.',
      'da na@example.com',
      'a@b@c.com',
    ])
      expect(() => parseEarlyAccess({ name: 'Dana', email })).toThrow(BadRequestException)
  })
})
