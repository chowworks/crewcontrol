import type { PublicTrip } from '@cc/types'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isPreviewBot, tripSharePage } from './share-preview'
import { previewVersion } from './trip-preview-image'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const trip = {
  slug: 'aruba',
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

  it("puts the trip's name, dates and its own picture in the preview tags", () => {
    const out = tripSharePage(html, trip, 'https://travel-hq.app/t/aruba')
    expect(meta(out, 'og:title')).toBe('Beach &quot;Week&quot; &amp; Friends')
    expect(meta(out, 'og:description')).toBe('March 2–6, 2028 · Aruba. Hosted by Maya.')
    expect(meta(out, 'twitter:description')).toBe('March 2–6, 2028 · Aruba. Hosted by Maya.')
    expect(meta(out, 'og:url')).toBe('https://travel-hq.app/t/aruba')
    const image = `https://travel-hq.app/api/trip-preview?slug=aruba&amp;v=${previewVersion(trip)}`
    expect(meta(out, 'og:image')).toBe(image)
    expect(meta(out, 'twitter:image')).toBe(image)
    expect(meta(out, 'og:image:width')).toBe('1200')
    expect(meta(out, 'og:image:height')).toBe('630')
    expect(out).toContain('<title>Beach &quot;Week&quot; &amp; Friends · Travel HQ</title>')
  })

  it("changes the picture's link when what it shows changes, not when the photo's signed link does", () => {
    const signed = (q: string) => ({
      ...trip,
      photos: [{ url: `https://photos.example.com/cover.jpg?sig=${q}`, caption: '' }],
    })
    expect(previewVersion(signed('a'))).toBe(previewVersion(signed('b')))
    expect(previewVersion({ ...trip, name: 'Aruba 2029' })).not.toBe(previewVersion(trip))
    expect(previewVersion({ ...trip, endDate: '2028-03-07' })).not.toBe(previewVersion(trip))
    expect(previewVersion({ ...trip, photos: [] })).not.toBe(previewVersion(trip))
  })
})
