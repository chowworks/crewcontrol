import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { parseHelpAnswer, parseHelpAsk, parseHelpEntry } from './help-input'
import { HelpService } from './help.service'

/** Organizer help (issue #66): the answers behind the Help button, and asking us when they don't cover it. */
@Controller('help')
@UseGuards(SignedInGuard)
export class HelpController {
  constructor(private readonly help: HelpService) {}

  // A few a person every ten minutes is plenty for questions to a person.
  private readonly limit = new RateLimiter(
    5,
    10 * 60 * 1000,
    'Too many questions. Try again in a few minutes.'
  )

  @Get()
  list() {
    return this.help.list()
  }

  @Post('questions')
  @HttpCode(204)
  async ask(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    const input = parseHelpAsk(body)
    this.limit.hit(caller.userId)
    await this.help.ask(input, caller)
  }
}

/** The Admin toolbox's help, in Review Customer Requests: answering organizers' questions and keeping the answers right. */
@Controller('admin/help')
@UseGuards(SignedInGuard)
@AdminOnly()
export class AdminHelpController {
  constructor(private readonly help: HelpService) {}

  @Get()
  view() {
    return this.help.adminView()
  }

  // The admin's red count: questions nobody has answered, and edited answers whose default changed.
  @Get('waiting')
  waiting() {
    return this.help.waiting()
  }

  @Post('entries')
  add(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.help.add(parseHelpEntry(body), caller)
  }

  @Put('entries/:key')
  save(@Param('key') key: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.help.save(key, parseHelpEntry(body), caller)
  }

  // Back to the default wording, or gone for an answer the admin added.
  @Delete('entries/:key')
  reset(@Param('key') key: string) {
    return this.help.reset(key)
  }

  @Post('questions/:id/answer')
  answer(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.help.answer(id, parseHelpAnswer(body), caller)
  }
}
