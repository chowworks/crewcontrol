import type { PublicTrip } from '@cc/types'
import { dateRange } from './format.js'

/**
 * A trip's link preview picture (1200 × 630), in the flyer's look (flyer-draw.ts): the cover photo darkened toward the
 * bottom, "Hosted by" on a royal pill, and the destination, name and dates in white. No QR code or price: the picture
 * is seen as a thumbnail on the phone that would scan it. Drawn from the public trip only, by api/trip-preview.ts.
 *
 * This file builds the layout as plain elements (no JSX), because Vercel runs the function's TypeScript as it is.
 */

export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

// The app's tokens (tailwind.config.js), as the drawing needs them.
const ROYAL = '#5A2D91'
const MARIGOLD = '#F2B33D'
export const HEADING = 'Bricolage Grotesque'
export const TEXT = 'Instrument Sans'

/** Travel HQ's mark (public/favicon.svg). */
const MARK =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5A2D91"/><path d="M33 16H21a8 8 0 0 0-8 8v11a8 8 0 0 0 8 8h3v7.5l9.5-7.5H43a8 8 0 0 0 8-8v-3" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><g transform="translate(33 7) scale(1.15)"><path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D"/><path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22"/></g></svg>'
  )

export interface PreviewElement {
  type: string
  props: { style?: Record<string, string | number>; children?: unknown; [key: string]: unknown }
}

const el = (
  type: string,
  style: Record<string, string | number>,
  children?: unknown,
  props: Record<string, unknown> = {}
): PreviewElement => ({ type, props: { style, children, ...props } })

/** What the picture says, from the public trip. */
export function previewFacts(trip: PublicTrip) {
  return {
    name: trip.name,
    destination: trip.destination,
    dates: dateRange(trip.startDate, trip.endDate),
    host: trip.organizerName,
  }
}

/**
 * The picture's layout. `cover` is the cover photo as a data URL, or null for the royal wash a trip without a photo
 * (or with one that couldn't be read) gets, as on the flyer.
 */
export function tripPreviewElement(trip: PublicTrip, cover: string | null): PreviewElement {
  const facts = previewFacts(trip)
  // A long name steps down a size before it wraps to a second line; a third is cut short.
  const nameSize = facts.name.length > 34 ? 64 : 80
  const shadow = '0 2px 12px rgba(15,28,46,0.6)'
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
        el(
          'img',
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            objectFit: 'cover',
          },
          undefined,
          {
            src: cover,
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
          }
        ),
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        backgroundImage: cover
          ? 'linear-gradient(180deg, rgba(15,28,46,0.25) 0%, rgba(15,28,46,0.45) 35%, rgba(15,28,46,0.85) 70%, rgba(15,28,46,0.96) 100%)'
          : 'linear-gradient(180deg, rgba(15,28,46,0) 40%, rgba(15,28,46,0.45) 100%)',
      }),
      el(
        'div',
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
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
                `Hosted by ${facts.host}`
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
              facts.destination.toUpperCase()
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
              facts.name
            ),
            el(
              'div',
              { display: 'flex', fontSize: 34, color: 'rgba(255,255,255,0.88)', marginTop: 18 },
              facts.dates
            ),
          ]),
        ]
      ),
    ].filter(Boolean)
  )
}

/**
 * A short fingerprint of what the picture shows, put on its link: when the organizer changes the name, dates, host
 * or cover photo, the link changes, so apps and Vercel's cache fetch the new picture instead of a saved one.
 */
export function previewVersion(trip: PublicTrip): string {
  // A cover's signed link changes on every fetch; the photo is the same while its address without the query is.
  const cover = (trip.photos[0]?.url ?? '').split('?')[0]
  const text = [
    trip.name,
    trip.destination,
    trip.startDate,
    trip.endDate,
    trip.organizerName,
    cover,
  ].join('\n')
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
