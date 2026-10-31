import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { EmailsService, parseEmailTemplateInput } from './emails.service'

/** The Admin toolbox's Emails page: the emails Travel HQ sends, edited by the admin with a live preview. */
@Controller('admin/emails')
@UseGuards(SignedInGuard)
@AdminOnly()
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @Get()
  list() {
    return this.emails.list()
  }

  // Bounces, blocked sends and spam complaints from Resend, on every trip. Before ':kind', which would take it.
  @Get('problems')
  problems() {
    return this.emails.listProblems()
  }

  // Every email sent in the last 30 days, envelope only. Before ':kind' too.
  @Get('sent')
  sent() {
    return this.emails.listSent()
  }

  @Get(':kind')
  get(@Param('kind') kind: string) {
    return this.emails.get(kind)
  }

  // A draft, filled in for a sample guest; nothing is saved.
  @Post(':kind/preview')
  preview(@Param('kind') kind: string, @Body() body: unknown, @Query('guest') guest = 'can_pay') {
    return this.emails.preview(kind, parseEmailTemplateInput(body), guest)
  }

  @Put(':kind')
  save(@Param('kind') kind: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.emails.save(kind, parseEmailTemplateInput(body), caller)
  }

  // Back to Travel HQ's default wording.
  @Delete(':kind')
  reset(@Param('kind') kind: string) {
    return this.emails.reset(kind)
  }
}
