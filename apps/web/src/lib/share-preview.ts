import type { PublicTrip } from '@cc/types'
import { dateRange } from './format'

/**
 * A trip page's own link preview: its name, dates and cover photo in place of Travel HQ's (index.html). The Vercel
 * middleware (middleware.ts) serves it to the apps that draw previews; people get the page as it is.
 */

// The apps that fetch a link to draw its preview (iMessage sends facebookexternalhit and Twitterbot).
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|skypeuripreview|applebot|googlebot|bingbot|pinterest|redditbot|embedly|snapchat/i

export function isPreviewBot(userAgent: string | null): boolean {
  return !!userAgent && PREVIEW_BOTS.test(userAgent)
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** index.html with the trip's title, description, address and cover photo in its preview tags. */
export function tripSharePage(html: string, trip: PublicTrip, pageUrl: string): string {
  const title = trip.name
  const description = `${dateRange(trip.startDate, trip.endDate)} · ${trip.destination}. Hosted by ${trip.organizerName}.`
  const cover = trip.photos[0]
  const tags: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:url': pageUrl,
    'twitter:title': title,
    'twitter:description': description,
    ...(cover && {
      'og:image': cover.url,
      'og:image:alt': cover.caption || title,
      'twitter:image': cover.url,
    }),
  }
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)} · Travel HQ</title>`)
  for (const [name, value] of Object.entries(tags)) {
    const attr = name.startsWith('og:') ? 'property' : 'name'
    out = out.replace(
      new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`),
      `$1${escape(value)}$2`
    )
  }
  // The share image's size, when the cover photo stands in for it, is the photo's own.
  if (cover) out = out.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/g, '')
  return out
}
