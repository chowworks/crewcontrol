import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import jpeg from 'jpeg-js'
import satori from 'satori'
import type { PublicTrip } from '@cc/types'
import {
  HEADING,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  TEXT,
  tripPreviewElement,
} from '../src/lib/trip-preview-image.js'

/**
 * A Vercel function: GET /api/trip-preview?slug=<slug>&v=<version> answers the trip's link preview picture
 * (src/lib/trip-preview-image.ts): laid out by satori, drawn by resvg and saved as a JPEG, because a photo as a PNG
 * runs past a megabyte and WhatsApp skips preview images over about 300 KB. The trip page's preview tags point here (share-preview.ts). The link carries a
 * fingerprint of what the picture shows, so Vercel keeps each picture for a week. An unknown or unpublished trip,
 * or anything that goes wrong, gets Travel HQ's own share image instead.
 */

const font = (file: string) => readFileSync(new URL(`./_fonts/${file}`, import.meta.url))
const FONTS = [
  { name: HEADING, data: font('BricolageGrotesque-ExtraBold.ttf'), weight: 800 as const },
  { name: TEXT, data: font('InstrumentSans-Regular.ttf'), weight: 400 as const },
  { name: TEXT, data: font('InstrumentSans-SemiBold.ttf'), weight: 600 as const },
]

const wasm = initWasm(
  readFileSync(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm'))
)

// The picture's photo formats it can draw. A WebP cover gets the royal wash, as a missing one does.
const PHOTO_TYPES = /^image\/(jpeg|png|svg\+xml)/

/** The cover photo as a data URL, or null when there is none or it can't be fetched in time. */
async function coverPhoto(trip: PublicTrip, origin: string): Promise<string | null> {
  const url = trip.photos[0]?.url
  if (!url) return null
  try {
    const res = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(4000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !PHOTO_TYPES.test(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const fallback = Response.redirect(new URL('/share-image.png?v=1', url), 302)
  const slug = url.searchParams.get('slug')
  const api = process.env.VITE_API_URL
  if (!slug || !api) return fallback
  try {
    const res = await fetch(`${api}/api/public/trips/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return fallback
    const trip = (await res.json()) as PublicTrip
    const svg = await satori(
      tripPreviewElement(trip, await coverPhoto(trip, url.origin)) as never,
      {
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        fonts: FONTS,
      }
    )
    await wasm
    const drawn = new Resvg(svg).render()
    const { data } = jpeg.encode(
      { data: drawn.pixels, width: drawn.width, height: drawn.height },
      82
    )
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    })
  } catch {
    return fallback
  }
}
