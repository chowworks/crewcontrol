import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { TripsService } from '../trips/trips.service'
import { RemindersService } from './reminders.service'

// Sample trips never send reminders (owner's decision, 2026-11-28): neither guests' nor vendor payment ones.
it('leaves sample trips out of both reminder runs', async () => {
  const trip = { findMany: jest.fn(async () => []) }
  const expense = { findMany: jest.fn(async () => []) }
  const prisma = { trip, expense } as unknown as PrismaService
  const service = new RemindersService(
    prisma,
    {} as TripsService,
    {} as EmailsService,
    {} as ClerkService
  )
  expect(await service.run(new Date('2026-11-28T14:00:00Z'))).toBe(0)
  expect(trip.findMany.mock.calls[0]).toEqual([
    expect.objectContaining({ where: expect.objectContaining({ isSample: false }) }),
  ])
  expect(expense.findMany.mock.calls[0]).toEqual([
    expect.objectContaining({
      where: expect.objectContaining({ trip: expect.objectContaining({ isSample: false }) }),
    }),
  ])
})
