import { ForbiddenException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import { TripsService } from './trips.service'
import type { TripInput } from './trip-types'

// The limited preview: only admins start trips, whatever the web app shows.
describe('creating a trip', () => {
  it('refuses anyone but an admin before touching the database', async () => {
    const prisma = { $transaction: jest.fn() }
    const service = new TripsService(
      prisma as unknown as PrismaService,
      {} as ClerkService,
      {} as EmailsService
    )
    await expect(
      service.create({ name: 'Aruba 2028' } as TripInput, { userId: 'u1', isAdmin: false })
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
