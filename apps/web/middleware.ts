import { next } from '@vercel/functions'
import type { PublicTrip } from '@cc/types'
import { isPreviewBot, tripSharePage } from './src/lib/share-preview.js'

/**
 * Vercel Routing Middleware: when an app fetches a trip page to draw its link preview, answer with the trip's own
 * name, dates and cover photo. People, and anything that goes wrong, get the page as it is.
 */
export const config = { matcher: '/t/:slug' }

export default async function middleware(request: Request): Promise<Response> {
  if (!isPreviewBot(request.headers.get('user-agent'))) return next()
  try {
    const url = new URL(request.url)
    const slug = decodeURIComponent(url.pathname.split('/')[2] ?? '')
    const api = process.env.VITE_API_URL
    if (!slug || !api) return next()
    const [page, res] = await Promise.all([
      fetch(new URL('/index.html', url), { signal: AbortSignal.timeout(3000) }),
      fetch(`${api}/api/public/trips/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(3000),
      }),
    ])
    // An unknown or unpublished trip keeps Travel HQ's own preview.
    if (!page.ok || !res.ok) return next()
    const trip = (await res.json()) as PublicTrip
    return new Response(tripSharePage(await page.text(), trip, url.href), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch {
    return next()
  }
}
