import { BadRequestException } from '@nestjs/common'
import { parseSlug } from './trip-input'

describe('parseSlug', () => {
  it('keeps the current link when none is sent', () => {
    expect(parseSlug({})).toBeUndefined()
    expect(parseSlug({ slug: '' })).toBeUndefined()
  })

  it('accepts a link and lowercases it', () => {
    expect(parseSlug({ slug: ' MV-2027 ' })).toBe('mv-2027')
  })

  it.each([
    ['ab', 'The trip link must be 3 to 60 characters'],
    ['x'.repeat(61), 'The trip link must be 3 to 60 characters'],
    ['mv 2027', 'The trip link can use only letters, numbers and single hyphens, like mv-2027'],
    ['mv--2027', 'The trip link can use only letters, numbers and single hyphens, like mv-2027'],
    ['-mv2027', 'The trip link can use only letters, numbers and single hyphens, like mv-2027'],
  ])('rejects %s', (slug, message) => {
    expect(() => parseSlug({ slug })).toThrow(new BadRequestException(message))
  })
})
