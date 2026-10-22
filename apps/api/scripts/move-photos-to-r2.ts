/**
 * One-time move of trip photos from the API's disk to R2. Run it before deploying the API that no longer serves
 * /uploads/: each photo is downloaded from its current address, put in the bucket under the same file name, and
 * its trip keeps the photo's bucket reference instead. Without --confirm-host it only lists what it would move.
 *
 *   npm run photos:move-to-r2 -w @cc/api                              (lists)
 *   npm run photos:move-to-r2 -w @cc/api -- --confirm-host <host>     (moves)
 *
 * Needs SCHEMA_DATABASE_URL (the owner, so it sees every trip) and the R2_* variables of the same environment.
 * Running it twice is safe: a photo already moved no longer has an /uploads/ address.
 */
import './lib/owner-env'
import { PrismaClient, type Prisma } from '@prisma/client'
import { photoBucketFromEnv } from '../src/photos/photo-bucket'
import { assertBypassesRls, dbHost, requireHostConfirmation } from './lib/db-guard'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

async function main() {
  const prisma = new PrismaClient()
  try {
    await assertBypassesRls(prisma)
    const apply = process.argv.includes('--confirm-host')
    if (apply) requireHostConfirmation()
    else console.log(`Database host: ${dbHost()} (listing only)`)
    const bucket = photoBucketFromEnv()
    if (apply && !bucket) throw new Error('Set the R2_* variables first')

    const trips = await prisma.trip.findMany({ select: { id: true, slug: true, photos: true } })
    let moved = 0
    for (const trip of trips) {
      const photos = trip.photos as unknown as { url: string; caption?: string }[]
      if (!photos.some((p) => p.url.includes('/uploads/'))) continue
      const next = []
      for (const photo of photos) {
        const name = photo.url.match(/\/uploads\/([\w-]+\.(jpg|png|webp))$/)
        if (!name) {
          next.push(photo)
          continue
        }
        console.log(`${trip.slug}: ${photo.url}`)
        if (!apply || !bucket) {
          next.push(photo)
          continue
        }
        const res = await fetch(photo.url)
        if (!res.ok)
          throw new Error(`${photo.url} answered ${res.status}; nothing changed for ${trip.slug}`)
        const ref = await bucket.put(name[1], Buffer.from(await res.arrayBuffer()), TYPES[name[2]])
        next.push({ ...photo, url: ref })
        moved++
      }
      if (apply)
        await prisma.trip.update({
          where: { id: trip.id },
          data: { photos: next as unknown as Prisma.InputJsonValue },
        })
    }
    console.log(apply ? `Moved ${moved} photos.` : 'Nothing changed.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
