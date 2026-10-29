import { Body, Controller, Get, Headers, Ip, Param, Post, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { parseClaim, parseJoin, parsePaymentReport } from '../trips/trip-input'
import { JoinService } from './join.service'

// The join page's endpoints: a signed-in guest's own place on a trip (/t/<slug>/join on the web app).
@Controller('join')
@UseGuards(SignedInGuard)
export class JoinController {
  constructor(private readonly join: JoinService) {}

  // Per person and trip, so one account can't hammer a trip's sign-ups.
  private readonly limit = new RateLimiter(
    10,
    10 * 60 * 1000,
    'Too many tries. Wait a few minutes.'
  )

  @Get(':slug')
  view(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    return this.join.view(slug, caller)
  }

  @Post(':slug')
  sign(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined
  ) {
    const input = parseJoin(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.join.join(slug, input, caller, { ip: ip ?? '', userAgent: userAgent ?? '' })
  }

  // "That's me": taking over the place someone signed the caller up with (issue #11).
  @Post(':slug/claim')
  claim(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined
  ) {
    const input = parseClaim(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.join.claim(slug, input, caller, { ip: ip ?? '', userAgent: userAgent ?? '' })
  }

  @Post(':slug/payments')
  report(@Param('slug') slug: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const input = parsePaymentReport(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.join.reportPayment(slug, input, caller)
  }
}

// The signed-in person's red count: what needs them on the trips they run, and payments due on the trips they joined.
@Controller('me')
@UseGuards(SignedInGuard)
export class MeController {
  constructor(private readonly join: JoinService) {}

  @Get('actions')
  actions(@CurrentCaller() caller: Caller) {
    return this.join.myActions(caller)
  }
}
