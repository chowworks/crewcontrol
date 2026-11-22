import type { PublicTrip } from '@cc/types'
import { dateRange } from './format.js'
import { previewVersion } from './trip-preview-image.js'

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

/** index.html with the trip's title, description, address and its own preview picture (api/trip-preview.ts). */
export function tripSharePage(html: string, trip: PublicTrip, pageUrl: string): string {
  const title = trip.name
  const description = `${dateRange(trip.startDate, trip.endDate)} · ${trip.destination}. Hosted by ${trip.organizerName}.`
  const image = `${new URL(pageUrl).origin}/api/trip-preview?slug=${encodeURIComponent(trip.slug)}&v=${previewVersion(trip)}`
  const tags: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:url': pageUrl,
    'twitter:title': title,
    'twitter:description': description,
    'og:image': image,
    'og:image:alt': `${title}. ${description}`,
    'twitter:image': image,
  }
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)} · Travel HQ</title>`)
  for (const [name, value] of Object.entries(tags)) {
    const attr = name.startsWith('og:') ? 'property' : 'name'
    out = out.replace(
      new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`),
      `$1${escape(value)}$2`
    )
  }
  return out
}
