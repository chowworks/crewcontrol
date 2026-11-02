import { BadRequestException } from '@nestjs/common'
import {
  HELP_ANSWER_MAX,
  HELP_ASK_MAX,
  HELP_PAGES,
  HELP_QUESTION_MAX,
  HELP_TOPICS,
  type HelpAnswerInput,
  type HelpAskInput,
  type HelpEntryInput,
  type HelpPage,
  type HelpTopic,
} from '../trips/trip-types'

function fail(message: string): never {
  throw new BadRequestException(message)
}

const object = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : fail('Send JSON')

function text(body: Record<string, unknown>, key: string, label: string, max: number): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) fail(`Add ${label}.`)
  const trimmed = value.trim()
  if (trimmed.length > max) fail(`Keep ${label} to ${max} characters.`)
  return trimmed
}

const isPage = (v: unknown): v is HelpPage => HELP_PAGES.some((p) => p.value === v)
const isTopic = (v: unknown): v is HelpTopic => HELP_TOPICS.some((t) => t.value === v)

function pages(value: unknown): HelpPage[] {
  if (!Array.isArray(value) || !value.every(isPage)) fail('Pick the pages it shows on.')
  return [...new Set(value)]
}

function topic(value: unknown): HelpTopic {
  if (!isTopic(value)) fail('Pick a topic.')
  return value
}

/** "Ask us a question" from the Help panel. */
export function parseHelpAsk(raw: unknown): HelpAskInput {
  const body = object(raw)
  if (!isPage(body.page)) fail('Unknown page')
  const tripId = typeof body.tripId === 'string' && body.tripId ? body.tripId : undefined
  return {
    question: text(body, 'question', 'your question', HELP_ASK_MAX),
    page: body.page,
    tripId,
  }
}

/** The admin adding or changing an answer. */
export function parseHelpEntry(raw: unknown): HelpEntryInput {
  const body = object(raw)
  return {
    topic: topic(body.topic),
    question: text(body, 'question', 'the question', HELP_QUESTION_MAX),
    answer: text(body, 'answer', 'the answer', HELP_ANSWER_MAX),
    pages: pages(body.pages),
    hidden: body.hidden === true,
  }
}

/** The admin answering an organizer's question, and maybe adding it to the help. */
export function parseHelpAnswer(raw: unknown): HelpAnswerInput {
  const body = object(raw)
  const answer = text(body, 'answer', 'your answer', HELP_ANSWER_MAX)
  if (body.addToHelp === null || body.addToHelp === undefined) return { answer, addToHelp: null }
  const add = object(body.addToHelp)
  return {
    answer,
    addToHelp: {
      question: text(add, 'question', 'the question for the help', HELP_QUESTION_MAX),
      topic: topic(add.topic),
      pages: pages(add.pages),
    },
  }
}
