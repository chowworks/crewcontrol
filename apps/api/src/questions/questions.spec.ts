import { BadRequestException } from '@nestjs/common'
import { parseAnswer, parseQuestion } from './questions.controller'

// What "Ask a question", "Answer" and "Add a question" accept.
describe('parseQuestion', () => {
  it('trims the question', () => {
    expect(parseQuestion({ question: '  Is there parking?  ' })).toBe('Is there parking?')
  })
  it('refuses an empty or too long question', () => {
    expect(() => parseQuestion({ question: '   ' })).toThrow(BadRequestException)
    expect(() => parseQuestion({ question: 'x'.repeat(501) })).toThrow(/500 characters/)
    expect(() => parseQuestion(null)).toThrow(/Write your question/)
  })
})

describe('parseAnswer', () => {
  const ok = { question: 'Parking?', answer: ' Three cars. ', status: 'private' }
  it('takes the question, the answer and who sees it', () => {
    expect(parseAnswer(ok)).toEqual({
      question: 'Parking?',
      answer: 'Three cars.',
      status: 'private',
    })
  })
  it('needs an answer and a choice of who sees it', () => {
    expect(() => parseAnswer({ ...ok, answer: '' })).toThrow(/Write the answer/)
    expect(() => parseAnswer({ ...ok, status: 'waiting' })).toThrow(/who sees the answer/)
    expect(() => parseAnswer({ ...ok, answer: 'x'.repeat(4001) })).toThrow(/4,000/)
  })
})
