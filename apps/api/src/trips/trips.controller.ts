import { Body, Controller, Get, Ip, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { RateLimiter } from '../core/rate-limit'
import { runAsPublic } from '../core/tenant-context'
import { ClerkService } from '../auth/clerk.service'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import {
  parseGuestUpdate,
  parseRegistration,
  parseRooms,
  parseSlug,
  parseTripInput,
} from './trip-input'
import { TripsService } from './trips.service'

// Organizer endpoints: signed in with Clerk, and only for the caller's own trips (admins: every trip).
@Controller('trips')
@UseGuards(SignedInGuard)
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly clerk: ClerkService
  ) {}

  @Get()
  async list(@CurrentCaller() caller: Caller) {
    return withOwnerNames(await this.trips.list(caller), this.clerk)
  }

  @Post()
  create(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.create(parseTripInput(body), caller, parseSlug(body))
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.get(id, caller)
  }

  @Get(':id/rooms')
  rooms(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.getRooms(id, caller)
  }

  @Put(':id/rooms')
  setRooms(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.setRooms(id, parseRooms(body), caller)
  }

  @Patch(':id/guests/:guestId')
  updateGuest(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.updateGuest(id, guestId, parseGuestUpdate(body), caller)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.update(id, parseTripInput(body), caller, parseSlug(body))
  }
}

@Controller('public/trips')
export class PublicTripsController {
  constructor(private readonly trips: TripsService) {}

  // Per visitor and trip, so one sender can't flood a trip's list, and friends on one network aren't blocked.
  private readonly limit = new RateLimiter(
    10,
    10 * 60 * 1000,
    'Too many sign-ups. Try again in a few minutes.'
  )

  @Post(':slug/register')
  register(@Param('slug') slug: string, @Body() body: unknown, @Ip() ip: string) {
    const input = parseRegistration(body)
    this.limit.hit(`${slug}|${ip}`)
    return runAsPublic(() => this.trips.register(slug, input))
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return runAsPublic(() => this.trips.getPublic(slug))
  }
}

@Controller('public/sample-trips')
export class SampleTripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list() {
    return runAsPublic(() => this.trips.listSamples())
  }
}

/**
 * The Admin toolbox: every trip, and seating the admin on one so it can open it as a member (as an organizer, or as
 * the owner of a trip that has none). The database logs each seat (TripMember_9_admin_logged).
 */
@Controller('admin')
@UseGuards(SignedInGuard)
@AdminOnly()
export class AdminController {
  constructor(
    private readonly trips: TripsService,
    private readonly clerk: ClerkService
  ) {}

  @Get('trips')
  async allTrips() {
    return withOwnerNames(await this.trips.listAll(), this.clerk)
  }

  @Post('trips/:id/seat')
  seat(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const asOwner = (body as { asOwner?: unknown } | null)?.asOwner === true
    return this.trips.seat(id, caller, asOwner)
  }
}

/** A trip list with its owners' names from Clerk in place of their ids (Your trips and Trip admin alike). */
async function withOwnerNames<T extends { ownerIds: string[] }>(trips: T[], clerk: ClerkService) {
  const names = await clerk.names([...new Set(trips.flatMap((t) => t.ownerIds))])
  return trips.map(({ ownerIds, ...t }) => ({
    ...t,
    ownerName: ownerIds.length ? ownerIds.map((id) => names.get(id) ?? 'Unknown').join(', ') : null,
  }))
}
