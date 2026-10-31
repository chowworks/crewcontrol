import { ForbiddenException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import { TripsService } from './trips.service'
import type { TripInput } from './trip-types'

// The limited preview: only admins, and people the admin approved for early access, start trips, whatever the web
// app shows.
describe('creating a trip', () => {
  const setup = (approved: number) => {
    const prisma = {
      $transaction: jest.fn(),
      earlyAccessRequest: { count: jest.fn().mockResolvedValue(approved) },
      systemSettings: { findUnique: jest.fn().mockResolvedValue({ limitedPreview: true }) },
    }
    const clerk = { verifiedEmails: jest.fn().mockResolvedValue(['dana@example.com']) }
    const service = new TripsService(
      prisma as unknown as PrismaService,
      clerk as unknown as ClerkService,
      {} as EmailsService
    )
    return { prisma, service }
  }

  it('refuses anyone but an admin or an approved person before touching the trips', async () => {
    const { prisma, service } = setup(0)
    await expect(
      service.create({ name: 'Aruba 2028' } as TripInput, { userId: 'u1', isAdmin: false })
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.earlyAccessRequest.count).toHaveBeenCalledWith({
      where: { email: { in: ['dana@example.com'] }, approvedAt: { not: null } },
    })
  })

  it('lets someone whose verified email the admin approved start trips', async () => {
    const { service } = setup(1)
    expect(await service.canStartTrips({ userId: 'u1', isAdmin: false })).toBe(true)
  })
})
