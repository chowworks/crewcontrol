import { BadRequestException } from '@nestjs/common'
import type { HelpEntry as HelpRow } from '@prisma/client'
import { HELP_PAGES, HELP_TOPICS } from '../trips/trip-types'
import { HELP_DEFAULTS, defaultHash } from './help-defaults'
import { parseHelpAnswer, parseHelpAsk, parseHelpEntry } from './help-input'
import { mergeHelp, newHelpKey } from './help.service'

const row = (over: Partial<HelpRow>): HelpRow => ({
  key: 'x',
  topic: 'payments',
  question: 'Q?',
  answer: 'A.',
  pages: ['control'],
  hidden: false,
  defaultHash: null,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  updatedByUserId: 'user_admin',
  ...over,
})

describe('the default answers', () => {
  it('have unique, stable-looking keys, a known topic, known pages and fit the limits', () => {
    const keys = HELP_DEFAULTS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of HELP_DEFAULTS) {
      expect(d.key).toMatch(/^[a-z0-9-]{1,80}$/)
      expect(HELP_TOPICS.map((t) => t.value)).toContain(d.topic)
      expect(d.pages.length).toBeGreaterThan(0)
      for (const p of d.pages) expect(HELP_PAGES.map((x) => x.value)).toContain(p)
      expect(d.question.length).toBeLessThanOrEqual(300)
      expect(d.answer.length).toBeLessThanOrEqual(4000)
    }
  })

  it('give every editor step and Trip Control at least one answer', () => {
    for (const p of HELP_PAGES)
      expect(HELP_DEFAULTS.some((d) => d.pages.includes(p.value))).toBe(true)
  })
})

describe('mergeHelp', () => {
  it('shows the defaults as they are when the admin changed nothing, in topic order', () => {
    const all = mergeHelp([])
    expect(all).toHaveLength(HELP_DEFAULTS.length)
    expect(all.every((e) => e.source === 'default' && !e.hidden)).toBe(true)
    const order = all.map((e) => HELP_TOPICS.findIndex((t) => t.value === e.topic))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('uses the admin’s version of a default, and flags it once the default changes after the edit', () => {
    const d = HELP_DEFAULTS[0]
    const fresh = mergeHelp([
      row({ key: d.key, topic: d.topic, answer: 'Mine.', defaultHash: defaultHash(d) }),
    ])
    const edited = fresh.find((e) => e.key === d.key)!
    expect(edited).toMatchObject({ source: 'edited', answer: 'Mine.', defaultChanged: false })
    expect(edited.original).toEqual({ question: d.question, answer: d.answer })
    const stale = mergeHelp([row({ key: d.key, topic: d.topic, defaultHash: 'older' })])
    expect(stale.find((e) => e.key === d.key)!.defaultChanged).toBe(true)
  })

  it('adds the admin’s own answers after the defaults of their topic', () => {
    const all = mergeHelp([row({ key: 'roommates-abc123', topic: 'payments' })])
    const added = all.find((e) => e.key === 'roommates-abc123')!
    expect(added).toMatchObject({ source: 'added', original: null, defaultChanged: false })
    const payments = all.filter((e) => e.topic === 'payments')
    expect(payments[payments.length - 1].key).toBe('roommates-abc123')
  })
})

describe('newHelpKey', () => {
  it('is words from the question with a random end, within the key rule', () => {
    const key = newHelpKey('Can guests pay with Venmo?')
    expect(key).toMatch(/^can-guests-pay-with-venmo-[0-9a-f]{6}$/)
    expect(newHelpKey('???')).toMatch(/^answer-[0-9a-f]{6}$/)
    expect(newHelpKey('a'.repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe('the help forms', () => {
  it('takes a question from a known page, with a trip when there is one', () => {
    expect(parseHelpAsk({ question: ' Why? ', page: 'control', tripId: 't1' })).toEqual({
      question: 'Why?',
      page: 'control',
      tripId: 't1',
    })
    expect(() => parseHelpAsk({ question: 'Why?', page: 'somewhere' })).toThrow(BadRequestException)
    expect(() => parseHelpAsk({ question: '  ', page: 'control' })).toThrow('Add your question.')
  })

  it('checks an answer’s topic and pages', () => {
    const ok = { topic: 'payments', question: 'Q?', answer: 'A.', pages: ['control', 'control'] }
    expect(parseHelpEntry(ok)).toEqual({ ...ok, pages: ['control'], hidden: false })
    expect(() => parseHelpEntry({ ...ok, topic: 'nope' })).toThrow('Pick a topic.')
    expect(() => parseHelpEntry({ ...ok, pages: ['nope'] })).toThrow('Pick the pages it shows on.')
  })

  it('takes an answer, with or without adding it to the help', () => {
    expect(parseHelpAnswer({ answer: 'Yes.' })).toEqual({ answer: 'Yes.', addToHelp: null })
    expect(
      parseHelpAnswer({
        answer: 'Yes.',
        addToHelp: { question: 'Q?', topic: 'start', pages: ['control'] },
      })
    ).toEqual({ answer: 'Yes.', addToHelp: { question: 'Q?', topic: 'start', pages: ['control'] } })
  })
})
