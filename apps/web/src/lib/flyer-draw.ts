import { FLYER_SIZE, qrModules, type FlyerFacts, type FlyerFormat } from './flyer'

// Drawing the trip flyer on a canvas: the cover photo fills it, darkened toward the bottom, with the facts in white.

// The app's tokens (tailwind.config.js), as a canvas needs them.
const ROYAL = '#5A2D91'
const INK = '#0F1C2E'
const MARIGOLD = '#F2B33D'
const HEADING = '"Bricolage Grotesque", system-ui, sans-serif'
const TEXT = '"Instrument Sans", system-ui, sans-serif'

/** Waits for the app's fonts, so the canvas doesn't draw in a fallback. */
export async function loadFlyerFonts(): Promise<void> {
  await Promise.all(
    [`800 40px ${HEADING}`, `600 40px ${HEADING}`, `400 40px ${TEXT}`, `600 40px ${TEXT}`].map(
      (font) => document.fonts.load(font).catch(() => [])
    )
  )
}

/** The flyer, drawn on a new canvas at full size. */
export function drawFlyer(
  facts: FlyerFacts,
  cover: HTMLImageElement | null,
  format: FlyerFormat
): HTMLCanvasElement {
  const { width, height } = FLYER_SIZE[format]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // Everything is measured in hundredths of the width, so the story and the page share one layout.
  const u = width / 100
  drawFullPhoto(ctx, facts, cover, width, height, u, format)
  return canvas
}

function drawFullPhoto(
  ctx: CanvasRenderingContext2D,
  facts: FlyerFacts,
  cover: HTMLImageElement | null,
  width: number,
  height: number,
  u: number,
  format: FlyerFormat
) {
  const pad = 7 * u
  photo(ctx, cover, 0, 0, width, height)
  const shade = ctx.createLinearGradient(0, 0, 0, height)
  shade.addColorStop(0, 'rgba(15,28,46,0.2)')
  shade.addColorStop(0.3, 'rgba(15,28,46,0.45)')
  shade.addColorStop(0.6, 'rgba(15,28,46,0.85)')
  shade.addColorStop(1, 'rgba(15,28,46,0.96)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, height)

  // "Hosted by" at the top, on a royal pill.
  ctx.font = `600 ${3.6 * u}px ${TEXT}`
  const host = ellipsize(ctx, `Hosted by ${facts.host}`, width - 2 * pad - 6 * u)
  pill(ctx, pad, pad, ctx.measureText(host).width + 6 * u, 8 * u, ROYAL)
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'middle'
  ctx.fillText(host, pad + 3 * u, pad + 4 * u)
  ctx.textBaseline = 'alphabetic'

  // Built from the bottom up: the code and link, the highlights, then the name above them.
  const code = (format === 'story' ? 24 : 20) * u
  const codeTop = height - pad - code
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, pad, codeTop, code, code, 2.5 * u)
  ctx.fill()
  qr(ctx, facts.url, pad + 1.5 * u, codeTop + 1.5 * u, code - 3 * u, '#FFFFFF')
  const textLeft = pad + code + 5 * u
  const textWidth = width - textLeft - pad
  ctx.fillStyle = MARIGOLD
  ctx.font = `800 ${6.4 * u}px ${HEADING}`
  ctx.fillText('Scan to join', textLeft, codeTop + code / 2 - 1 * u)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `500 ${3.6 * u}px ${TEXT}`
  ctx.fillText(ellipsize(ctx, facts.link, textWidth), textLeft, codeTop + code / 2 + 5.5 * u)

  // The name and what sits with it take a known height; the highlights get what room is left, in order.
  ctx.font = `800 ${10 * u}px ${HEADING}`
  const name = wrap(ctx, facts.name, width - 2 * pad, format === 'story' ? 3 : 2)
  const nameBlock = name.length * 11 * u + 8 * u + 9 * u + 10 * u + 6 * u
  const room = codeTop - 6 * u - (pad + 14 * u) - nameBlock
  const item = 11.5 * u
  const shown = facts.highlights.slice(0, Math.max(0, Math.floor(room / item)))

  // Text over a photo keeps a soft shadow, so a bright photo can't wash it out.
  ctx.shadowColor = 'rgba(15,28,46,0.6)'
  ctx.shadowBlur = 1.5 * u
  let bottom = codeTop - 6 * u
  const textWidth2 = width - 2 * pad - 5 * u
  for (const h of [...shown].reverse()) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = `400 ${3.8 * u}px ${TEXT}`
    if (h.detail) ctx.fillText(ellipsize(ctx, h.detail, textWidth2), pad + 5 * u, bottom)
    const titleLine = h.detail ? bottom - 5.2 * u : bottom
    ctx.fillStyle = MARIGOLD
    ctx.beginPath()
    ctx.arc(pad + 1.2 * u, titleLine - 1.5 * u, 1.2 * u, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `600 ${4.4 * u}px ${TEXT}`
    ctx.fillText(ellipsize(ctx, h.title, textWidth2), pad + 5 * u, titleLine)
    bottom -= item
  }

  bottom -= 4 * u
  ctx.font = `600 ${4.6 * u}px ${HEADING}`
  const chipH = 9 * u
  pill(ctx, pad, bottom - chipH, ctx.measureText(facts.price).width + 7 * u, chipH, MARIGOLD)
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(facts.price, pad + 3.5 * u, bottom - chipH / 2)
  ctx.textBaseline = 'alphabetic'
  bottom -= chipH + 6 * u

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `500 ${4.4 * u}px ${TEXT}`
  ctx.fillText(facts.dates, pad, bottom)
  bottom -= 8 * u

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 ${10 * u}px ${HEADING}`
  name.reverse().forEach((line) => {
    ctx.fillText(line, pad, bottom)
    bottom -= 11 * u
  })
  ctx.fillStyle = MARIGOLD
  ctx.font = `600 ${3.6 * u}px ${TEXT}`
  ctx.fillText(spaced(facts.destination.toUpperCase()), pad, bottom + 1 * u)
  ctx.shadowColor = 'transparent'
}

/** The photo cropped to fill the box, or a royal wash when there is none. */
function photo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (!img || !img.naturalWidth) {
    const wash = ctx.createLinearGradient(x, y, x + w, y + h)
    wash.addColorStop(0, ROYAL)
    wash.addColorStop(1, '#3F1E66')
    ctx.fillStyle = wash
    ctx.fillRect(x, y, w, h)
    return
  }
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

/** The QR code in ink on its own light square (a code needs a light margin around it to scan). */
function qr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  light = '#FFFFFF'
) {
  const modules = qrModules(text)
  const n = modules.length
  // Two squares of quiet margin each side.
  const cell = Math.floor(size / (n + 4))
  const inset = (size - cell * n) / 2
  ctx.fillStyle = light
  roundRect(ctx, x, y, size, size, cell * 2)
  ctx.fill()
  ctx.fillStyle = INK
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(x + inset + c * cell, y + inset + r * cell, cell, cell)
    })
  )
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string
) {
  ctx.fillStyle = fill
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Letter-spaced capitals, which a canvas can't do on its own everywhere. */
const spaced = (text: string) => text.split('').join(' ')

/** The text in at most `max` lines that fit the width, the last one cut short with "…" if needed. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines.map((l) => ellipsize(ctx, l, width))
  const kept = lines.slice(0, max)
  kept[max - 1] = ellipsize(ctx, `${kept[max - 1]} ${lines[max]}`, width, true)
  return kept
}

/** The text cut with "…" to fit the width (always cut when `more` says text was dropped after it). */
function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  more = false
): string {
  if (!more && ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}
