import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { encode } from 'jpeg-js'
import satori from 'satori'
import { dateRange } from '../messaging/email-context'
import type { TripPhoto } from './trip-types'

/**
 * A trip's link preview picture (1200 × 630), the picture chat apps show when someone shares the trip page. Drawn when
 * the trip is saved (owner's decision, 2026-11-21) and kept in the photo bucket, in the flyer's look (the web app's
 * flyer-draw.ts): the cover photo darkened toward the bottom, "Hosted by" on a royal pill, then the destination, name
 * and dates, with Travel HQ's mark. No QR code or price: the picture is seen as a thumbnail on the phone that would
 * scan it. Only facts the public page already shows go on it.
 *
 * Laid out by satori, drawn by resvg and saved as a JPEG: a photo as a PNG runs past a megabyte, and WhatsApp skips
 * preview pictures over about 300 KB.
 */

export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

/** What the picture shows. */
export interface PreviewFacts {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  photos: TripPhoto[]
}

/**
 * A short fingerprint of what the picture shows, kept in its name: a save that changes none of it keeps the picture
 * it has. A cover's signed link changes with every read, so only its address without the query counts.
 */
export function previewVersion(trip: PreviewFacts): string {
  const cover = (trip.photos[0]?.url ?? '').split('?')[0]
  const text = [
    trip.name,
    trip.destination,
    trip.startDate,
    trip.endDate,
    trip.organizerName,
    cover,
  ].join('\n')
  return createHash('sha256').update(text).digest('base64url').slice(0, 10).replace(/[^\w]/g, '0')
}

/** The picture's file name in the bucket: its fingerprint, and a random part so a name is never reused. */
export const previewName = (trip: PreviewFacts) =>
  `preview-${previewVersion(trip)}-${randomUUID().slice(0, 8)}.jpg`

/** Whether `ref` (the trip's stored picture) is still the picture of `trip` as it is now. */
export const previewIsCurrent = (ref: string | null, trip: PreviewFacts) =>
  !!ref && ref.includes(`preview-${previewVersion(trip)}-`)

// The app's tokens (the web app's tailwind.config.js), as the drawing needs them.
const ROYAL = '#5A2D91'
const MARIGOLD = '#F2B33D'
const HEADING = 'Bricolage Grotesque'
const TEXT = 'Instrument Sans'

/** Travel HQ's mark (the web app's public/favicon.svg). */
const MARK = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5A2D91"/><path d="M33 16H21a8 8 0 0 0-8 8v11a8 8 0 0 0 8 8h3v7.5l9.5-7.5H43a8 8 0 0 0 8-8v-3" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><g transform="translate(33 7) scale(1.15)"><path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D"/><path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22"/></g></svg>'
).toString('base64')}`

type Style = Record<string, string | number>
interface Element {
  type: string
  props: { style: Style; children?: unknown; [key: string]: unknown }
}
const el = (type: string, style: Style, children?: unknown, props = {}): Element => ({
  type,
  props: { style, children, ...props },
})

/** The picture's layout. `cover` is the cover photo as a data URL, or null for the flyer's royal wash. */
export function previewLayout(trip: PreviewFacts, cover: string | null): Element {
  // A long name steps down a size before it wraps to a second line; a third is cut short.
  const nameSize = trip.name.length > 34 ? 64 : 80
  const shadow = '0 2px 12px rgba(15,28,46,0.6)'
  const fill: Style = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  }
  return el(
    'div',
    {
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      display: 'flex',
      position: 'relative',
      backgroundImage: `linear-gradient(135deg, ${ROYAL}, #3F1E66)`,
      fontFamily: TEXT,
      color: '#FFFFFF',
    },
    [
      cover &&
        el('img', { ...fill, objectFit: 'cover' }, undefined, {
          src: cover,
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
        }),
      el('div', {
        ...fill,
        backgroundImage: cover
          ? 'linear-gradient(180deg, rgba(15,28,46,0.25) 0%, rgba(15,28,46,0.45) 35%, rgba(15,28,46,0.85) 70%, rgba(15,28,46,0.96) 100%)'
          : 'linear-gradient(180deg, rgba(15,28,46,0) 40%, rgba(15,28,46,0.45) 100%)',
      }),
      el(
        'div',
        {
          ...fill,
          padding: '56px 64px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        },
        [
          el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
            el(
              'div',
              {
                display: 'flex',
                // On the royal wash a royal pill would vanish, so it turns to a light glass one there.
                backgroundColor: cover ? ROYAL : 'rgba(255,255,255,0.18)',
                borderRadius: 999,
                padding: '10px 24px',
                fontSize: 28,
                fontWeight: 600,
                maxWidth: 820,
              },
              el(
                'span',
                { display: 'block', lineClamp: 1, overflow: 'hidden' },
                `Hosted by ${trip.organizerName}`
              )
            ),
            el(
              'div',
              {
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontFamily: HEADING,
                fontSize: 32,
                fontWeight: 800,
                textShadow: shadow,
              },
              [
                el('img', { width: 52, height: 52 }, undefined, {
                  src: MARK,
                  width: 52,
                  height: 52,
                }),
                'Travel HQ',
              ]
            ),
          ]),
          el('div', { display: 'flex', flexDirection: 'column', textShadow: shadow }, [
            el(
              'div',
              {
                display: 'block',
                lineClamp: 1,
                color: MARIGOLD,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: 4,
              },
              trip.destination.toUpperCase()
            ),
            el(
              'div',
              {
                display: 'block',
                lineClamp: 2,
                fontFamily: HEADING,
                fontSize: nameSize,
                fontWeight: 800,
                lineHeight: 1.08,
                marginTop: 12,
              },
              trip.name
            ),
            el(
              'div',
              { display: 'flex', fontSize: 34, color: 'rgba(255,255,255,0.88)', marginTop: 18 },
              dateRange(trip.startDate, trip.endDate)
            ),
          ]),
        ]
      ),
    ].filter(Boolean)
  )
}

const asset = (file: string) => readFileSync(join(__dirname, '../../assets/fonts', file))
let engine:
  Promise<{ fonts: { name: string; data: Buffer; weight: 400 | 600 | 800 }[] }> | undefined
/** Loads the fonts and the drawing engine once, on the first picture. */
function ready() {
  engine ??= initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'))).then(
    () => ({
      fonts: [
        { name: HEADING, data: asset('BricolageGrotesque-ExtraBold.ttf'), weight: 800 as const },
        { name: TEXT, data: asset('InstrumentSans-Regular.ttf'), weight: 400 as const },
        { name: TEXT, data: asset('InstrumentSans-SemiBold.ttf'), weight: 600 as const },
      ],
    })
  )
  return engine
}

// The photo formats the drawing can use. A WebP cover gets the royal wash, as a missing one does.
const PHOTO_TYPES = /^image\/(jpeg|png|svg\+xml)/

/** A photo's bytes as a data URL the drawing can use, or null when it isn't one of those formats. */
export function photoData(bytes: Buffer, contentType: string): string | null {
  const type = contentType.split(';')[0].trim()
  return PHOTO_TYPES.test(type) ? `data:${type};base64,${bytes.toString('base64')}` : null
}

/** The picture as a JPEG. */
export async function drawPreview(trip: PreviewFacts, cover: string | null): Promise<Buffer> {
  const { fonts } = await ready()
  const svg = await satori(previewLayout(trip, cover) as never, {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    fonts,
  })
  const drawn = new Resvg(svg).render()
  const { data } = encode({ data: drawn.pixels, width: drawn.width, height: drawn.height }, 82)
  return Buffer.from(data)
}
