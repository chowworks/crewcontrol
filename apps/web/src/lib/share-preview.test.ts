import type { PublicTrip } from '@cc/types'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isPreviewBot, tripSharePage } from './share-preview'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const trip = {
  name: 'Beach "Week" & Friends',
  destination: 'Aruba',
  startDate: '2028-03-02',
  endDate: '2028-03-06',
  organizerName: 'Maya',
  photos: [{ url: 'https://photos.example.com/cover.jpg', caption: 'The pool' }],
} as PublicTrip
const meta = (out: string, name: string) =>
  out.match(new RegExp(`(?:property|name)="${name}"\\s+content="([^"]*)"`))?.[1]

describe('trip share preview', () => {
  it('tells preview apps from people', () => {
    expect(isPreviewBot('facebookexternalhit/1.1 Facebot Twitterbot/1.0')).toBe(true)
    expect(isPreviewBot('WhatsApp/2.23.20.0')).toBe(true)
    expect(
      isPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')
    ).toBe(false)
    expect(isPreviewBot(null)).toBe(false)
  })

  it("puts the trip's name, dates and cover in the preview tags", () => {
    const out = tripSharePage(html, trip, 'https://travel-hq.app/t/aruba')
    expect(meta(out, 'og:title')).toBe('Beach &quot;Week&quot; &amp; Friends')
    expect(meta(out, 'og:description')).toBe('March 2–6, 2028 · Aruba. Hosted by Maya.')
    expect(meta(out, 'twitter:description')).toBe('March 2–6, 2028 · Aruba. Hosted by Maya.')
    expect(meta(out, 'og:url')).toBe('https://travel-hq.app/t/aruba')
    expect(meta(out, 'og:image')).toBe('https://photos.example.com/cover.jpg')
    expect(meta(out, 'twitter:image')).toBe('https://photos.example.com/cover.jpg')
    expect(meta(out, 'og:image:alt')).toBe('The pool')
    expect(out).not.toContain('og:image:width')
    expect(out).toContain('<title>Beach &quot;Week&quot; &amp; Friends · Travel HQ</title>')
  })

  it("keeps Travel HQ's share image for a trip without photos", () => {
    const out = tripSharePage(html, { ...trip, photos: [] }, 'https://travel-hq.app/t/aruba')
    expect(meta(out, 'og:image')).toBe('https://travel-hq.app/share-image.png?v=1')
    expect(out).toContain('og:image:width')
  })
})
