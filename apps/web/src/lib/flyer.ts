import { roomsPricedApart, type PublicTrip } from '@cc/types'
import qrcode from 'qrcode-generator'
import { dateRange, money } from './format'

// The trip flyer (issue #15): drawn in the browser from the public trip only, so nothing toPublicTrip hides can get
// on it. A story-sized image for phones and a letter page for printing.

export type FlyerFormat = 'story' | 'letter'

/** Pixel sizes: a phone story, and a letter page at 300 dots per inch. */
export const FLYER_SIZE: Record<FlyerFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  letter: { width: 2550, height: 3300 },
}

/** What a flyer says, from the public trip. */
export interface FlyerFacts {
  name: string
  destination: string
  dates: string
  /** "$1,200 per person", or "From $900 per person" when rooms are priced apart (as on the trip page). */
  price: string
  /** At most three, in the organizer's order. */
  highlights: { title: string; detail: string }[]
  host: string
  /** The trip page's address, for the QR code. */
  url: string
  /** The same address without "https://", to print under the code. */
  link: string
}

export function flyerFacts(trip: PublicTrip, origin: string): FlyerFacts {
  const apart = roomsPricedApart(trip.rooms, trip.costPerPersonCents)
  const cents = apart ? Math.min(...trip.rooms.map((r) => r.priceCents)) : trip.costPerPersonCents
  const url = `${origin}/t/${trip.slug}`
  return {
    name: trip.name,
    destination: trip.destination,
    dates: dateRange(trip.startDate, trip.endDate),
    price: `${apart ? 'From ' : ''}${money(cents)} per person`,
    highlights: trip.highlights
      .filter((h) => h.title.trim())
      .map((h) => ({ title: h.title, detail: h.detail })),
    host: trip.organizerName,
    url,
    link: url.replace(/^https?:\/\//, ''),
  }
}

/** The QR code's squares, row by row (true is dark). */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/**
 * A one-page PDF holding one JPEG that fills the page: enough for a printable flyer without a PDF library.
 * Width and height are the page's in points (letter is 612 × 792).
 */
export function pdfFromJpeg(
  jpeg: Uint8Array<ArrayBuffer>,
  image: { width: number; height: number },
  page = { width: 612, height: 792 }
): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array<ArrayBuffer>[] = []
  const offsets: number[] = []
  let length = 0
  const add = (part: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (n: number, body: string) => {
    offsets[n] = length
    add(`${n} 0 obj\n${body}\nendobj\n`)
  }
  const draw = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`

  add('%PDF-1.4\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'
  )
  offsets[4] = length
  add(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
  )
  add(jpeg)
  add('\nendstream\nendobj\n')
  object(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)

  const xref = length
  add(`xref\n0 6\n0000000000 65535 f \n`)
  for (let n = 1; n <= 5; n++) add(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts, { type: 'application/pdf' })
}

/** Saves a file the browser made, as the CSV downloads do. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
