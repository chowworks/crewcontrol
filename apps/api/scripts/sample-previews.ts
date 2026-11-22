import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { drawPreview, photoData } from '../src/trips/trip-preview'
import type { PublicTrip } from '../src/trips/trip-types'

/**
 * Draws the three sample trips' link preview pictures into the web app's public/seed/, where the seed points them
 * (`/seed/<slug>-preview.jpg`). Sample trips aren't saved through the editor, so nothing draws theirs on save. Run it
 * after changing a sample trip's name, dates, host or cover, or the picture's look (trip-preview.ts):
 *
 *   npx ts-node scripts/sample-previews.ts [API address, default the shared dev API]
 */
const SLUGS = ['mv-beach-house-2027', 'aruba-2028', 'tulum-40th-2027']
const api = process.argv[2] ?? 'https://api-dev-dev-aac8.up.railway.app'
const web = join(__dirname, '../../web/public')

async function cover(url: string | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('/')) return photoData(readFileSync(join(web, url)), 'image/svg+xml')
  const res = await fetch(url)
  return photoData(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? '')
}

async function main() {
  for (const slug of SLUGS) {
    const res = await fetch(`${api}/api/public/trips/${slug}`)
    if (!res.ok) throw new Error(`${slug}: ${res.status}`)
    const trip = (await res.json()) as PublicTrip
    const file = join(web, `seed/${slug}-preview.jpg`)
    writeFileSync(file, await drawPreview(trip, await cover(trip.photos[0]?.url)))
    console.log(`Wrote ${file}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
