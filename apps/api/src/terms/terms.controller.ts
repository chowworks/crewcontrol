import { Body, Controller, Get, Headers, HttpCode, Ip, Post, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { TERMS } from './terms-text'
import { parseAcceptTerms, TermsService } from './terms.service'

// Travel HQ's Terms, for the /terms page: no sign-in.
@Controller('public/terms')
export class PublicTermsController {
  @Get()
  get() {
    return TERMS
  }
}

// Where the signed-in person stands with the Terms, and accepting them. Never gated by the Terms themselves.
@Controller('me/terms')
@UseGuards(SignedInGuard)
export class MyTermsController {
  constructor(private readonly terms: TermsService) {}

  private readonly limit = new RateLimiter(10, 60_000, 'Too many tries. Wait a minute.')

  @Get()
  mine(@CurrentCaller() caller: Caller) {
    return this.terms.mine(caller.userId)
  }

  @Post()
  @HttpCode(200)
  accept(
    @Body() body: unknown,
    @CurrentCaller() caller: Caller,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined
  ) {
    const input = parseAcceptTerms(body)
    this.limit.hit(caller.userId)
    return this.terms.accept(caller.userId, input, { ip: ip ?? '', userAgent: userAgent ?? '' })
  }
}
