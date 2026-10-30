import { unzipSync } from 'fflate'
import type { Caller } from '../auth/caller'
import type { PrismaService } from '../prisma/prisma.service'
import { TripExportService } from './trip-export.service'
import type { TripsService } from './trips.service'

const sig = (guestId: string, typedName: string) => ({
  guestId,
  typedName,
  text: 'The agreement.',
  textHash: 'abc',
  templateVersion: '1',
  signedAt: new Date('2026-10-01T12:00:00Z'),
})

describe('TripExportService', () => {
  it('zips each signed agreement as a PDF named for its guest, and leaves photos outside the bucket alone', async () => {
    const trips = {
      get: async () => ({
        name: 'Tulum',
        guests: [
          { id: 'a', firstName: 'Kendra', lastName: "O'Neal" },
          { id: 'b', firstName: 'Kendra', lastName: "O'Neal" },
        ],
      }),
    } as unknown as TripsService
    const prisma = {
      agreementSignature: { findMany: async () => [sig('a', 'Kendra'), sig('b', 'Kendra')] },
      trip: { findUniqueOrThrow: async () => ({ photos: [{ url: 'https://example.com/a.jpg' }] }) },
    } as unknown as PrismaService
    const zip = await new TripExportService(prisma, trips).files('T', {} as Caller)
    const files = unzipSync(new Uint8Array(zip))
    expect(Object.keys(files).sort()).toEqual([
      'agreements/kendra-oneal-2.pdf',
      'agreements/kendra-oneal.pdf',
    ])
    expect(Buffer.from(files['agreements/kendra-oneal.pdf'].subarray(0, 5)).toString()).toBe(
      '%PDF-'
    )
  })
})
