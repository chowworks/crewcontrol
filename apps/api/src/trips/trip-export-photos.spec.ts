import { unzipSync } from 'fflate'
import type { Caller } from '../auth/caller'
import type { PrismaService } from '../prisma/prisma.service'
import { TripExportService } from './trip-export.service'
import type { TripsService } from './trips.service'

// Its own file: the bucket is made once per module load, from the variables set here before the first photo.
describe('TripExportService photos', () => {
  it('downloads bucket photos a few at a time, sections’ included, each numbered in its place', async () => {
    Object.assign(process.env, {
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_PHOTOS_BUCKET: 'crewcontrol-photos-test',
    })
    const ref = (n: number) => ({ url: `r2:trip-photos/p${n}.jpg`, caption: '' })
    const prisma = {
      agreementSignature: { findMany: async () => [] },
      trip: {
        findUniqueOrThrow: async () => ({
          photos: [ref(1), { url: 'https://example.com/a.jpg' }, ref(3)],
          sections: [{ title: 'Getting there', body: '', photos: [4, 5, 6, 7, 8, 9, 10].map(ref) }],
        }),
      },
    } as unknown as PrismaService
    const trips = { get: async () => ({ name: 'Tulum', guests: [] }) } as unknown as TripsService
    let running = 0
    let most = 0
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      running++
      most = Math.max(most, running)
      // Later photos answer sooner, so the order they arrive in isn't the order they're numbered in.
      const n = Number(/p(\d+)\.jpg/.exec(String(url))![1])
      await new Promise((r) => setTimeout(r, 30 - n))
      running--
      return new Response(new Uint8Array([n]))
    })
    try {
      const zip = await new TripExportService(prisma, trips).files('T', {} as Caller)
      const files = unzipSync(new Uint8Array(zip))
      const names = Object.keys(files).sort()
      expect(names).toEqual(
        [1, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `photos/${String(n).padStart(2, '0')}.jpg`)
      )
      for (const name of names) expect(files[name][0]).toBe(Number(name.slice(7, 9)))
      expect(most).toBeGreaterThan(1)
      expect(most).toBeLessThanOrEqual(6)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
