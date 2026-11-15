import { BadRequestException } from '@nestjs/common'
import { CHANGE_REQUEST_MAX } from '../trips/trip-types'
import { parseClose, parseNote, parseRequest } from './changes.controller'

describe('trip change request forms', () => {
  it('needs the change described, within the limit', () => {
    expect(parseRequest({ request: '  Move me to the ocean-view room  ' })).toBe(
      'Move me to the ocean-view room'
    )
    expect(() => parseRequest({ request: '   ' })).toThrow(BadRequestException)
    expect(() => parseRequest({ request: 'x'.repeat(CHANGE_REQUEST_MAX + 1) })).toThrow(
      BadRequestException
    )
  })

  it('needs a note written', () => {
    expect(parseNote({ text: 'Asked the resort' })).toBe('Asked the resort')
    expect(() => parseNote({})).toThrow(BadRequestException)
  })

  it('closes as done with or without a message, and as not possible only with one', () => {
    expect(parseClose({ status: 'done' })).toEqual({ status: 'done', reply: '' })
    expect(parseClose({ status: 'declined', reply: 'The room is full.' })).toEqual({
      status: 'declined',
      reply: 'The room is full.',
    })
    expect(() => parseClose({ status: 'declined', reply: ' ' })).toThrow(BadRequestException)
    expect(() => parseClose({ status: 'open' })).toThrow(BadRequestException)
  })
})
