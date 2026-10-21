import { BadRequestException } from '@nestjs/common'
import { parseContactInput } from './contact-input'

const ok = {
  name: 'Jordan Price',
  email: 'jordan.price@example.com',
  topic: 'trip-help',
  message: 'How do I add a co-organizer?',
}

describe('parseContactInput', () => {
  it('accepts a filled-in form and trims it', () => {
    expect(parseContactInput({ ...ok, name: '  Jordan Price ' })).toEqual({ ...ok, website: '' })
  })

  it.each([
    [{ ...ok, name: ' ' }, 'Name is required'],
    [{ ...ok, email: 'not-an-email' }, 'Email must be an email address'],
    [{ ...ok, topic: 'sales' }, 'Pick a topic'],
    [{ ...ok, message: 'x'.repeat(4001) }, 'Message must be at most 4000 characters'],
  ])('rejects %o', (body, message) => {
    expect(() => parseContactInput(body)).toThrow(new BadRequestException(message))
  })
})
