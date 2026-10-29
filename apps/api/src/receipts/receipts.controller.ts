import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import { parseDismissReceipt, parseMatchReceipt } from '../trips/trip-input'
import { ForwardedReceiptsService } from './forwarded-receipts.service'

/** A trip's receipts address, and the forwarded receipts its organizers match to a guest or dismiss. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ForwardedReceiptsService) {}

  @Put(':id/receipts-address')
  setAddress(
    @Param('id') id: string,
    @Body() body: { address?: unknown } | undefined,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.setAddress(id, body?.address ?? null, caller)
  }

  @Get(':id/payments/:paymentId/receipt')
  proof(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.proof(id, paymentId, caller)
  }

  @Post(':id/receipts/:receiptId/match')
  match(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.match(id, receiptId, parseMatchReceipt(body), caller)
  }

  @Post(':id/receipts/:receiptId/dismiss')
  dismiss(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.dismiss(id, receiptId, parseDismissReceipt(body), caller)
  }

  @Delete(':id/receipt-senders/:senderId')
  forgetSender(
    @Param('id') id: string,
    @Param('senderId') senderId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.forgetSender(id, senderId, caller)
  }
}

/** Admin toolbox → Forwarded receipts: every email received, every address used, and releasing a retired one. */
@Controller('admin')
@UseGuards(SignedInGuard)
@AdminOnly()
export class AdminReceiptsController {
  constructor(private readonly receipts: ForwardedReceiptsService) {}

  // A payment's forwarded receipt on a trip the admin looks at read-only (Control panel).
  @Get('trips/:id/payments/:paymentId/receipt')
  proof(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.receipts.proof(id, paymentId, caller, true)
  }

  @Get('forwarded-receipts')
  list() {
    return this.receipts.adminList()
  }

  @Post('forwarded-receipts/:id/run-again')
  runAgain(@Param('id') id: string) {
    return this.receipts.runAgain(id)
  }

  @Post('receipts-addresses/:id/release')
  release(@Param('id') id: string, @Body() body: { receivedSinceRemoval?: unknown } | undefined) {
    return this.receipts.release(id, body?.receivedSinceRemoval)
  }
}
