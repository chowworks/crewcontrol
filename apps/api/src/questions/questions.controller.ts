import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import { ANSWER_MAX, QUESTION_MAX, type QuestionAnswerInput } from '../trips/trip-types'
import { QuestionsService } from './questions.service'

const fields = (raw: unknown) =>
  (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

/** Checks a question: written, and short enough. */
export function parseQuestion(raw: unknown): string {
  const b = fields(raw)
  const question = typeof b.question === 'string' ? b.question.trim() : ''
  if (!question) throw new BadRequestException('Write your question')
  if (question.length > QUESTION_MAX)
    throw new BadRequestException(`Keep it to ${QUESTION_MAX} characters`)
  return question
}

/** Checks "Answer" and "Add a question": the question, the answer, and who sees it. */
export function parseAnswer(raw: unknown): QuestionAnswerInput {
  const b = fields(raw)
  const question = parseQuestion(raw)
  const answer = typeof b.answer === 'string' ? b.answer.trim() : ''
  if (!answer) throw new BadRequestException('Write the answer')
  if (answer.length > ANSWER_MAX)
    throw new BadRequestException(
      `Keep the answer to ${ANSWER_MAX.toLocaleString('en-US')} characters`
    )
  if (b.status !== 'public' && b.status !== 'private')
    throw new BadRequestException('Choose who sees the answer')
  return { question, answer, status: b.status }
}

/** Trip Control's Questions: the trip's organizers answer, add, edit, reorder and delete. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get(':id/questions')
  list(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.questions.forTrip(id, caller)
  }

  @Post(':id/questions')
  add(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.questions.add(id, parseAnswer(body), caller)
  }

  @Put(':id/questions/order')
  reorder(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const ids = fields(body).ids
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string'))
      throw new BadRequestException('ids must be a list of question ids')
    return this.questions.reorder(id, ids as string[], caller)
  }

  @Post(':id/questions/:qid/answer')
  answer(
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.questions.answer(id, qid, parseAnswer(body), caller)
  }

  @Patch(':id/questions/:qid')
  edit(
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.questions.edit(id, qid, parseAnswer(body), caller)
  }

  @Delete(':id/questions/:qid')
  remove(@Param('id') id: string, @Param('qid') qid: string, @CurrentCaller() caller: Caller) {
    return this.questions.remove(id, qid, caller)
  }
}

/** The trip page's "Ask a question": a signed-in person asks, and reads their own questions. */
@Controller('join')
@UseGuards(SignedInGuard)
export class AskQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  // Per person and trip, so one account can't flood an organizer's inbox.
  private readonly limit = new RateLimiter(
    5,
    10 * 60 * 1000,
    'Too many questions. Wait a few minutes.'
  )

  @Get(':slug/questions')
  mine(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    return this.questions.mine(slug, caller)
  }

  @Post(':slug/questions')
  ask(@Param('slug') slug: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const question = parseQuestion(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.questions.ask(slug, question, caller)
  }
}
