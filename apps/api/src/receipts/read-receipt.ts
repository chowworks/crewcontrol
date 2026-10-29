import type { PaymentMethodKind } from '../trips/trip-types'

/** What a forwarded payment email says, as far as plain rules can tell. Nothing here guesses with AI. */
export interface ReadReceipt {
  /** Whole cents; null when no single amount could be told. */
  amountCents: number | null
  /** Who sent the money, when the email names them ("Kendra Smith sent you $300"). */
  payerName: string
  /** Who got it, when the email is the sender's own confirmation ("You sent $300 to Chris Howard"). */
  payeeName: string
  methodKind: PaymentMethodKind | null
  /** 'YYYY-MM-DD' when the email says the day; null otherwise. */
  sentOn: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  reg: '®',
  trade: '™',
  middot: '·',
  ndash: '–',
  mdash: '—',
}

/** An HTML email as plain lines: blocks become line breaks, tags go, entities are decoded. */
export function htmlToText(html: string): string {
  // Stripped until nothing changes, so a tag split around another ("<scr<script>ipt>") can't come back together.
  let text = html.slice(0, 500_000)
  let before: string
  do {
    before = text
    text = text
      .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\b[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section)\s*>/gi, '\n')
      .replace(/<(td|th)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  } while (text !== before)
  return (
    text
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] === '#') {
          const code =
            e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
          return Number.isFinite(code) && code > 0 && code < 0x110000
            ? String.fromCodePoint(code)
            : ' '
        }
        return ENTITIES[e.toLowerCase()] ?? m
      })
      // No angle brackets survive, whether from a broken tag or an encoded one: it is only ever read as text.
      .replace(/[<>]/g, ' ')
  )
}

/** The email's text, one trimmed line per line, blank lines dropped: the text part, else the HTML made plain. */
export function plainText(text: string | null, html: string | null): string {
  const raw = text?.trim() ? text : html ? htmlToText(html) : ''
  return raw
    .slice(0, 200_000)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/^(\s*>)+/, '')
        .replace(/[\t\u00a0 ]+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n')
}

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?`
// A name: up to five words of letters (with . ' ’ -), on one line. Words like "for" are cut off after (nameOf).
const NAME = String.raw`([A-Za-z][A-Za-z.'’-]*(?:[ ][A-Za-z][A-Za-z.'’-]*){0,4})`
const STOP = new Set([
  'for',
  'on',
  'via',
  'with',
  'and',
  'to',
  'at',
  'has',
  'have',
  'is',
  'was',
  'sent',
  'using',
  'from',
  'in',
  'the',
  'your',
  'you',
  'through',
  'by',
  'zelle',
  'zelle®',
])

const cents = (whole: string, part?: string) =>
  Number(whole.replace(/,/g, '')) * 100 + (part ? Number(part) : 0)

/** A captured name, cut at the first word that isn't part of one ("Kendra Smith for Beach house" → "Kendra Smith"). */
function nameOf(raw: string | undefined): string {
  if (!raw) return ''
  const words: string[] = []
  for (const w of raw.trim().split(' ')) {
    if (STOP.has(w.toLowerCase())) break
    words.push(w)
  }
  const name = words.join(' ').replace(/[.'’-]+$/, '')
  // "You" or a lone initial is no name.
  return name.length >= 2 && !/^(you|we|i|me|it)$/i.test(name) ? name : ''
}

// Patterns that tell the amount and who paid or got it, on one line, most telling first.
const RECEIVED: RegExp[] = [
  new RegExp(String.raw`${NAME} (?:has )?(?:sent|paid) you ${MONEY}`),
  new RegExp(String.raw`${NAME} (?:has )?sent ${MONEY} to you`),
]
const RECEIVED_FROM: RegExp[] = [
  new RegExp(
    String.raw`(?:received|got|deposited)\b[^$\n]{0,40}?${MONEY}[^\n]{0,30}? from ${NAME}`,
    'i'
  ),
  new RegExp(String.raw`payment of ${MONEY} from ${NAME}`, 'i'),
]
const SENT_TO: RegExp[] = [
  new RegExp(String.raw`\byou(?:'ve| have)? sent ${MONEY}[^\n]{0,20}? to ${NAME}`, 'i'),
  new RegExp(String.raw`\byour payment of ${MONEY} to ${NAME}`, 'i'),
]
const PAID_TO = new RegExp(String.raw`\byou(?:'ve| have)? paid ${NAME} ${MONEY}`, 'i')

const LABEL =
  /^(amount|payment amount|amount sent|amount received|from|sender|sent by|payer|to|recipient|paid to|sent to|date|sent on|transaction date|payment date|date sent)\s*:?\s*(.*)$/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** The first calendar day written in `s`: "Oct 22, 2026", "October 22 2026", "10/22/2026" or "2026-10-22". */
export function dayIn(s: string): string | null {
  const iso = /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(s)
  const named =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (20\d\d)\b/i.exec(
      s
    )
  const slashed = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d|\d\d)\b/.exec(s)
  const found = [
    iso && { at: iso.index, y: +iso[1], m: +iso[2], d: +iso[3] },
    named && {
      at: named.index,
      y: +named[3],
      m: MONTHS.indexOf(named[1].toLowerCase()) + 1,
      d: +named[2],
    },
    slashed && {
      at: slashed.index,
      y: slashed[3].length === 2 ? 2000 + +slashed[3] : +slashed[3],
      m: +slashed[1],
      d: +slashed[2],
    },
  ]
    .filter((x): x is { at: number; y: number; m: number; d: number } => !!x)
    .sort((a, b) => a.at - b.at)
  for (const { y, m, d } of found) {
    const day = `${y}-${pad(m)}-${pad(d)}`
    const t = new Date(`${day}T00:00:00Z`)
    if (!Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === day) return day
  }
  return null
}

/** How it was paid, by the service the email names; null when it names none. */
export function methodIn(text: string): PaymentMethodKind | null {
  const t = text.toLowerCase()
  if (/cash ?app|cash\.app/.test(t)) return 'cashapp'
  if (/\bvenmo\b/.test(t)) return 'venmo'
  if (/\bpaypal\b/.test(t)) return 'paypal'
  if (/\bapple cash\b/.test(t)) return 'applecash'
  if (/\bzelle\b/.test(t)) return 'zelle'
  return null
}

/**
 * Reads a payment email someone forwarded: the amount, who paid (or who was paid), how, and the day. Built for Zelle
 * (from any bank), Cash App and bank alerts, in the wordings they use ("Kendra Smith sent you $300.00", "You received
 * $300.00 from KENDRA SMITH", "You sent $300 to Chris Howard", or label lines such as "Amount: $300.00"). Only what it
 * can tell for sure: no single amount reads as null, and the organizer decides.
 */
export function readReceipt(text: string, subject: string | null = null): ReadReceipt {
  const lines = [...(subject ? [subject] : []), ...text.split('\n')]
  let amount: number | null = null
  let payerName = ''
  let payeeName = ''
  for (const line of lines) {
    if (amount !== null) break
    for (const re of RECEIVED) {
      const m = re.exec(line)
      if (m && nameOf(m[1])) {
        amount = cents(m[2], m[3])
        payerName = nameOf(m[1])
        break
      }
    }
    if (amount !== null) break
    for (const re of RECEIVED_FROM) {
      const m = re.exec(line)
      if (m) {
        amount = cents(m[1], m[2])
        payerName = nameOf(m[3])
        break
      }
    }
    if (amount !== null) break
    for (const re of SENT_TO) {
      const m = re.exec(line)
      if (m) {
        amount = cents(m[1], m[2])
        payeeName = nameOf(m[3])
        break
      }
    }
    if (amount !== null) break
    const paid = PAID_TO.exec(line)
    if (paid) {
      amount = cents(paid[2], paid[3])
      payeeName = nameOf(paid[1])
    }
  }

  // Label lines ("Amount: $300.00", "From" then "KENDRA SMITH" on the next line), as bank alerts lay them out. A value
  // with an @ or <> is a forwarded message's header, not the payment.
  let labelDay: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = LABEL.exec(lines[i])
    if (!m) continue
    const label = m[1].toLowerCase()
    const value = (m[2] || lines[i + 1] || '').trim()
    if (!value || /[@<>]/.test(value)) continue
    if (label.includes('amount')) {
      const money = new RegExp(MONEY).exec(value)
      if (amount === null && money) amount = cents(money[1], money[2])
    } else if (label.includes('date') || label === 'sent on') {
      labelDay ??= dayIn(value)
    } else if (['from', 'sender', 'sent by', 'payer'].includes(label)) {
      if (!payerName && !payeeName)
        payerName = nameOf(/^[A-Za-z][A-Za-z.'’ -]{1,60}$/.test(value) ? value : '')
    } else if (!payerName && !payeeName) {
      payeeName = nameOf(/^[A-Za-z][A-Za-z.'’ -]{1,60}$/.test(value) ? value : '')
    }
  }

  // Last, one amount said however many times: a short alert with nothing else to go on.
  if (amount === null) {
    const all = [...text.matchAll(new RegExp(MONEY, 'g'))]
      .map((m) => cents(m[1], m[2]))
      .filter((c) => c > 0)
    if (all.length > 0 && all.every((c) => c === all[0])) amount = all[0]
  }

  // The day: a labeled one, else the forwarded message's own Date line, else the first day the text names.
  const dateLine = lines.find((l) => /^(date|sent)\s*:/i.test(l))
  const sentOn = labelDay ?? (dateLine ? dayIn(dateLine) : null) ?? dayIn(text)

  return {
    amountCents: amount !== null && amount > 0 ? amount : null,
    payerName,
    payeeName,
    methodKind: methodIn([subject ?? '', text].join('\n')),
    sentOn,
  }
}
