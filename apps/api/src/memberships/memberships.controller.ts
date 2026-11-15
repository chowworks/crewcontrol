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
import { BadRequestException } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import { isPaidFeature, parseMemberEmail, parseMembership } from './membership-input'
import { MembershipsService } from './memberships.service'

/** The signed-in organizer's paid features (issue #90): what they have, and closing a feature's popup. */
@Controller('me/features')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class MyFeaturesController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  mine(@CurrentCaller() caller: Caller) {
    return this.memberships.myFeatures(caller)
  }

  @Post('seen')
  @HttpCode(204)
  async seen(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    const features = (body as { features?: unknown } | null)?.features
    if (!Array.isArray(features) || !features.every(isPaidFeature))
      throw new BadRequestException('features must be a list of paid features')
    await this.memberships.markSeen(caller, features)
  }
}

/** Manage Memberships in the Admin toolbox: who has which paid features, by email. */
@Controller('admin/memberships')
@UseGuards(SignedInGuard)
@AdminOnly()
export class AdminMembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list() {
    return this.memberships.list()
  }

  @Put(':email')
  set(@Param('email') email: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const isNew = (body as { isNew?: unknown } | null)?.isNew === true
    return this.memberships.set(parseMemberEmail(email), parseMembership(body), caller, isNew)
  }

  @Delete(':email')
  remove(@Param('email') email: string) {
    return this.memberships.remove(parseMemberEmail(email))
  }
}
