import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { zipSync, type Zippable } from 'fflate'
import type { Caller } from '../auth/caller'
import { isPhotoRef, photoBucket } from '../photos/photo-bucket'
import { PrismaService } from '../prisma/prisma.service'
import { agreementPdf } from './agreement-pdf'
import type { TripPhoto } from './trip-types'
import { TripsService } from './trips.service'

/** "Kendra M. O'Neal" → "kendra-m-oneal", for file names. */
const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * The files of "Download everything" that only the API can make (issue #2; owner's decision, 2026-10-30): each signed
 * agreement as a PDF and each photo kept in the bucket, as a zip. The browser adds the spreadsheets and the rest of
 * the trip to it from what Trip Control shows, so the export never holds more than the trip's people can see.
 */
@Injectable()
export class TripExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService
  ) {}

  async files(id: string, caller: Caller): Promise<Buffer> {
    const trip = await this.trips.get(id, caller)
    const files: Zippable = {}

    const signatures = await this.prisma.agreementSignature.findMany({
      where: { tripId: id },
      orderBy: { signedAt: 'asc' },
    })
    for (const sig of signatures) {
      const guest = trip.guests.find((g) => g.id === sig.guestId)
      const who =
        fileSlug(guest ? `${guest.firstName} ${guest.lastName}` : sig.typedName) || 'guest'
      let name = `agreements/${who}.pdf`
      for (let n = 2; files[name]; n++) name = `agreements/${who}-${n}.pdf`
      files[name] = await agreementPdf({ tripName: trip.name, ...sig })
    }

    // Only photos in the bucket: any other address (the seed's) is a link the trip already lists, never fetched here.
    const { photos } = await this.prisma.trip.findUniqueOrThrow({
      where: { id },
      select: { photos: true },
    })
    const bucket = photoBucket()
    const refs = (photos as unknown as TripPhoto[]).map((p) => p.url)
    for (const [i, ref] of refs.entries()) {
      if (!bucket || !isPhotoRef(ref)) continue
      const res = await fetch(await bucket.sign(ref))
      if (!res.ok) throw new ServiceUnavailableException('A photo could not be loaded')
      // Photos are already compressed, so they are stored as they are.
      files[`photos/${String(i + 1).padStart(2, '0')}.${ref.split('.').pop()}`] = [
        new Uint8Array(await res.arrayBuffer()),
        { level: 0 },
      ]
    }
    return Buffer.from(zipSync(files))
  }
}
