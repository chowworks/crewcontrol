import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { RateLimiter } from '../core/rate-limit'
import type { Caller } from '../auth/caller'
import { runAsPublic } from '../core/tenant-context'
import { ClerkService } from '../auth/clerk.service'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import {
  parseExpense,
  parseGuestUpdate,
  parseOrganizerRequest,
  parsePaymentDecision,
  parsePaymentLog,
  parseRooms,
  parseSlug,
  parseSystemSettings,
  parseTripInput,
  parseTripPerson,
  parseTripRole,
} from './trip-input'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import type { OrganizerRequest } from './trip-types'
import { ExpensesService } from './expenses.service'
import { PeopleService } from './people.service'
import { TripsService } from './trips.service'

// Organizer endpoints: signed in with Clerk, the Organizer Terms accepted, and only for the caller's own trips
// (admins: every trip).
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly people: PeopleService,
    private readonly expenses: ExpensesService,
    private readonly clerk: ClerkService
  ) {}

  @Get()
  async list(@CurrentCaller() caller: Caller) {
    // Trips the caller was invited to before they first signed in show up here.
    await this.people.claimInvites(caller)
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

  // The agreement as this trip's guests would sign it today (read-only: organizers can't edit it).
  @Get(':id/agreement')
  agreement(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.agreement(id, caller)
  }

  @Get(':id/guests/:guestId/agreement')
  guestAgreement(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestAgreement(id, guestId, caller)
  }

  @Get(':id/log')
  log(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.log(id, caller)
  }

  @Get(':id/guests/:guestId/history')
  guestHistory(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestHistory(id, guestId, caller)
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

  // A reported payment: it arrived, it didn't, or undo that.
  @Patch(':id/payments/:paymentId')
  decidePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.decidePayment(id, paymentId, parsePaymentDecision(body), caller)
  }

  // A payment the organizer saw arrive (handed over in person), logged as confirmed.
  @Post(':id/guests/:guestId/payments')
  logPayment(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.logPayment(id, guestId, parsePaymentLog(body), caller)
  }

  // Trip Financials' vendor expenses: what the organizer pays out, recorded only.
  @Get(':id/expenses')
  listExpenses(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.expenses.list(id, caller)
  }

  @Post(':id/expenses')
  addExpense(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.expenses.add(id, parseExpense(body), caller)
  }

  @Put(':id/expenses/:expenseId')
  updateExpense(
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.expenses.update(id, expenseId, parseExpense(body), caller)
  }

  @Delete(':id/expenses/:expenseId')
  removeExpense(
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.expenses.remove(id, expenseId, caller)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.update(id, parseTripInput(body), caller, parseSlug(body))
  }

  // The trip's People screen: who runs it. Its owners add, change and remove them.
  @Get(':id/people')
  listPeople(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.people.list(id, caller, false)
  }

  @Post(':id/people')
  addPerson(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.people.add(id, parseTripPerson(body), caller, false)
  }

  @Patch(':id/people/:userId')
  setPersonRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.setRole(id, userId, parseTripRole(body), caller, false)
  }

  @Patch(':id/invites/:email')
  setInviteRole(
    @Param('id') id: string,
    @Param('email') email: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.setInviteRole(id, email.toLowerCase(), parseTripRole(body), caller, false)
  }

  @Delete(':id/invites/:email')
  cancelInvite(
    @Param('id') id: string,
    @Param('email') email: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.cancelInvite(id, email.toLowerCase(), caller, false)
  }

  @Delete(':id/people/:userId')
  removePerson(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.remove(id, userId, caller, false)
  }
}

@Controller('public/trips')
export class PublicTripsController {
  constructor(private readonly trips: TripsService) {}

  // Joining needs sign-in: see join/join.controller.ts.
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
    private readonly people: PeopleService,
    private readonly expenses: ExpensesService,
    private readonly clerk: ClerkService
  ) {}

  @Get('trips')
  async allTrips() {
    return withOwnerNames(await this.trips.listAll(), this.clerk)
  }

  // Any trip, read-only and without a seat (owner's decision, 2026-10-28): the Admin toolbox's Edit and Control panel.
  // A plain look is not logged; to change the trip the admin adds itself on its People screen, which is.
  @Get('trips/:id')
  trip(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.get(id, caller, true)
  }

  @Get('trips/:id/expenses')
  tripExpenses(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.expenses.list(id, caller, true)
  }

  @Get('trips/:id/rooms')
  tripRooms(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.getRooms(id, caller, true)
  }

  @Get('trips/:id/agreement')
  tripAgreement(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.agreement(id, caller, true)
  }

  @Get('trips/:id/log')
  tripLog(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.log(id, caller, true)
  }

  @Get('trips/:id/guests/:guestId/agreement')
  tripGuestAgreement(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestAgreement(id, guestId, caller, true)
  }

  @Get('trips/:id/guests/:guestId/history')
  tripGuestHistory(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestHistory(id, guestId, caller, true)
  }

  @Post('trips/:id/seat')
  seat(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const asOwner = (body as { asOwner?: unknown } | null)?.asOwner === true
    return this.trips.seat(id, caller, asOwner)
  }

  // The trip's People screen: who runs it. Its owners add, change and remove them (here, the admin, on any trip).
  @Get('trips/:id/people')
  listPeople(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.people.list(id, caller, true)
  }

  @Post('trips/:id/people')
  addPerson(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.people.add(id, parseTripPerson(body), caller, true)
  }

  @Patch('trips/:id/people/:userId')
  setPersonRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.setRole(id, userId, parseTripRole(body), caller, true)
  }

  @Patch('trips/:id/invites/:email')
  setInviteRole(
    @Param('id') id: string,
    @Param('email') email: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.setInviteRole(id, email.toLowerCase(), parseTripRole(body), caller, true)
  }

  @Delete('trips/:id/invites/:email')
  cancelInvite(
    @Param('id') id: string,
    @Param('email') email: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.cancelInvite(id, email.toLowerCase(), caller, true)
  }

  @Delete('trips/:id/people/:userId')
  removePerson(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.people.remove(id, userId, caller, true)
  }

  // What organizers asked for (other refund terms), newest first, with who asked.
  @Get('requests')
  async requests() {
    const rows = await this.trips.listRequests()
    const names = await this.clerk.names([...new Set(rows.map((r) => r.userId))])
    return rows.map((r): OrganizerRequest => ({
      id: r.id,
      kind: r.kind as OrganizerRequest['kind'],
      userName: names.get(r.userId) ?? 'Unknown',
      tripName: r.tripName,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  // System Settings: app-wide values (for now, the waitlist buffer).
  @Get('settings')
  settings() {
    return this.trips.settings()
  }

  @Put('settings')
  setSettings(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.setSettings(parseSystemSettings(body), caller)
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

// Organizers asking for what Travel HQ doesn't do yet (other refund terms): kept for the Travel HQ team.
@Controller('requests')
@UseGuards(SignedInGuard)
export class RequestsController {
  constructor(private readonly trips: TripsService) {}

  // A few per person every ten minutes is plenty for a suggestion box.
  private readonly limit = new RateLimiter(
    5,
    10 * 60 * 1000,
    'Too many requests. Try again in a few minutes.'
  )

  @Post()
  @HttpCode(204)
  async add(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    const input = parseOrganizerRequest(body)
    this.limit.hit(caller.userId)
    await this.trips.addRequest(input, caller)
  }
}
