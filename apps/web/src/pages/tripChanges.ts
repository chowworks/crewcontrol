import type { TripChange, TripChangeField, TripFieldChange, TripLogEntry } from '@cc/types'

// The trip log's lines for what organizers changed (owner's decision, 2026-11-01), in plain words.

export type ChangeEntry = Extract<TripLogEntry, { kind: 'change' }>

const LABEL: Record<TripChangeField, string> = {
  name: 'the name',
  dates: 'the dates',
  price: 'the price',
  spots: 'the number of spots',
  joinMode: 'how guests get a spot',
  refundPolicy: 'the refund terms',
  paymentPlan: 'the payment plan',
  published: 'publishing',
  link: 'the trip link',
  destination: 'the destination',
  host: 'the host name',
  description: 'the description',
  photos: 'the photos',
  photoTitle: 'the photo section’s title',
  highlights: 'the highlights',
  keyDates: 'the key dates',
  guestNames: 'showing guests’ names',
  paymentMethods: 'the payment methods',
  paymentInstructions: 'the payment instructions',
  reminders: 'the payment reminders',
  saveTheDate: 'save the date',
  roomChoice: 'room picking',
  signupNote: 'the sign-up note',
  vendorCosts: 'vendor costs',
  roomPricing: 'how rooms are priced',
  costSplit: 'how the trip splits the cost',
  ownPart: 'what you put in',
  confirmReceipts: 'confirming forwarded receipts',
}

/** "a", "a and b", "a, b and c". */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Clauses that may hold their own "and": "x", "x and y", "x, y, and z" (the last comma keeps them apart). */
function clauseList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

const arrow = (from: string, to: string) => `${from} → ${to}`

type RoomsChange = Extract<TripChange, { what: 'rooms' }>
/** A field as a line shows it: `back` when it was changed and then put back within one line. */
type Shown = TripFieldChange & { back?: boolean }

/** Switches read as turned on or off, not as "changed (off → on)". */
const SWITCHES = new Set<TripChangeField>([
  'saveTheDate',
  'guestNames',
  'vendorCosts',
  'confirmReceipts',
])

/** The editor's changes (trip fields and rooms) as clauses: "changed the price ($235 → $250)", "published the trip". */
function editorClauses(fields: Shown[], rooms: RoomsChange | null): string[] {
  const clauses: string[] = []
  const published = fields.find((f) => f.field === 'published')
  if (published)
    clauses.push(
      published.back
        ? published.to === 'on'
          ? 'unpublished and republished the trip'
          : 'published and then unpublished the trip'
        : published.to === 'on'
          ? 'published the trip'
          : 'unpublished the trip'
    )
  const changed: string[] = []
  for (const f of fields) {
    if (f.field === 'published') continue
    if (f.back) changed.push(`${LABEL[f.field]} (and put it back)`)
    else if (SWITCHES.has(f.field))
      clauses.push(`turned ${f.to === 'on' ? 'on' : 'off'} ${LABEL[f.field]}`)
    else if (f.field === 'roomChoice')
      clauses.push(
        f.to === 'required'
          ? `made ${LABEL.roomChoice} required`
          : `turned ${f.to === 'off' ? 'off' : 'on'} ${LABEL.roomChoice}`
      )
    else if (f.from !== undefined && f.to !== undefined)
      changed.push(`${LABEL[f.field]} (${arrow(f.from, f.to)})`)
    else changed.push(LABEL[f.field])
  }
  if (changed.length) clauses.push(`changed ${list(changed)}`)
  if (!rooms) return clauses
  if (rooms.added.length) clauses.push(`added ${list(rooms.added)}`)
  if (rooms.removed.length) clauses.push(`removed ${list(rooms.removed)}`)
  if (rooms.renamed.length)
    clauses.push(`renamed ${list(rooms.renamed.map((r) => arrow(r.from, r.to)))}`)
  if (rooms.prices.length)
    clauses.push(
      `changed the price of ${list(rooms.prices.map((p) => `${p.room} (${arrow(p.from, p.to)})`))}`
    )
  const named =
    rooms.added.length || rooms.removed.length || rooms.renamed.length || rooms.prices.length
  if (rooms.other) clauses.push(named ? 'changed other room details' : 'changed the rooms')
  return clauses
}

/**
 * Several room saves as one, oldest first: a room added and then removed drops out, a new room renamed keeps its new
 * name, and a room's price changes become one from → to, under its latest name.
 */
function combineRooms(saves: RoomsChange[]): RoomsChange | null {
  if (!saves.length) return null
  const out: RoomsChange = {
    what: 'rooms',
    added: [],
    removed: [],
    renamed: [],
    prices: [],
    other: false,
  }
  const rename = (from: string, to: string) => {
    out.added = out.added.map((n) => (n === from ? to : n))
    out.prices = out.prices.map((p) => (p.room === from ? { ...p, room: to } : p))
  }
  for (const s of saves) {
    out.other ||= s.other
    for (const r of s.renamed) {
      if (out.added.includes(r.from)) {
        rename(r.from, r.to)
        continue
      }
      const earlier = out.renamed.find((x) => x.to === r.from)
      if (earlier) earlier.to = r.to
      else out.renamed.push({ ...r })
      rename(r.from, r.to)
    }
    out.renamed = out.renamed.filter((x) => x.from !== x.to)
    for (const p of s.prices) {
      const earlier = out.prices.find((x) => x.room === p.room)
      if (earlier) earlier.to = p.to
      else out.prices.push({ ...p })
    }
    out.prices = out.prices.filter((x) => x.from !== x.to)
    out.added.push(...s.added)
    for (const name of s.removed) {
      if (out.added.includes(name)) out.added = out.added.filter((n) => n !== name)
      else out.removed.push(name)
      out.prices = out.prices.filter((x) => x.room !== name)
    }
  }
  return out
}

const ROLE = { owner: 'an owner', organizer: 'an organizer' } as const

/** What happened, without who did it: "changed the price ($235 → $250)". */
export function changeText(c: TripChange): string {
  switch (c.what) {
    case 'trip':
      return clauseList(editorClauses(c.fields, null))
    case 'rooms':
      return clauseList(editorClauses([], c))
    case 'announcement':
      return `${c.action === 'posted' ? 'posted' : 'deleted'} an announcement: “${c.text}”`
    case 'invite':
      if (c.action === 'sent') return `invited ${c.email} as ${ROLE[c.role]}`
      if (c.action === 'role') return `changed ${c.email}’s invite to ${ROLE[c.role]}`
      return `cancelled ${c.email}’s invite`
    case 'expense':
      if (c.action === 'added') return `added a vendor cost: ${c.payee}, ${c.amount}`
      if (c.action === 'changed') return `changed a vendor cost: ${c.payee}, ${c.amount}`
      return `removed a vendor cost: ${c.payee}, ${c.amount}`
    case 'interest_removed':
      return `took ${c.name} off the Interested list`
    case 'signups_opened':
      return c.emailed
        ? `launched sign-ups and emailed ${c.emailed} interested ${c.emailed === 1 ? 'person' : 'people'}`
        : 'launched sign-ups'
    case 'question':
      return `${c.action === 'edited' ? 'edited' : 'deleted'} a question: “${c.question}”`
    case 'trip_deleted':
      return 'deleted the trip'
    case 'trip_restored':
      return 'restored the trip'
  }
}

/** Who did it: the organizer by name, the admin as "An admin". */
export const changeActor = (e: ChangeEntry) => (e.byAdmin ? 'An admin' : e.actorName)

/** What an editor save says when nothing shows: it can't happen for one save, which is only logged when it changed. */
const NOTHING_SHOWN = 'edited the trip'

/** One saved change as a sentence, for the download: "Kendra changed the price ($235 → $250)". */
export const changeSentence = (e: ChangeEntry) =>
  `${changeActor(e)} ${changeText(e.change) || NOTHING_SHOWN}`

/** How close together one person's editor saves must be to show as one line. */
export const MERGE_MINUTES = 15

const fromEditor = (e: ChangeEntry) => e.change.what === 'trip' || e.change.what === 'rooms'

/** Several of one person's editor saves shown as one line: newest first, so `entries[0]` is the latest. */
export interface ChangeGroup {
  kind: 'changes'
  at: string
  first: string
  entries: ChangeEntry[]
}

/**
 * The log with one person's editor saves made within MERGE_MINUTES of the one before folded into one line, placed
 * where the newest one is. Another person's editor save between them ends the line, so nobody's line takes in
 * someone else's change. Other lines stay as they are. `entries` is newest first.
 */
export function mergeEdits(entries: TripLogEntry[]): (TripLogEntry | ChangeGroup)[] {
  const out: (TripLogEntry | ChangeGroup)[] = []
  let open = null as { who: string; group: ChangeGroup } | null
  for (const e of entries) {
    if (e.kind !== 'change' || !fromEditor(e)) {
      out.push(e)
      continue
    }
    const who = `${e.byAdmin}|${e.actorName}`
    if (
      open?.who === who &&
      Date.parse(open.group.first) - Date.parse(e.at) <= MERGE_MINUTES * 60_000
    ) {
      open.group.entries.push(e)
      open.group.first = e.at
      continue
    }
    const group: ChangeGroup = { kind: 'changes', at: e.at, first: e.at, entries: [e] }
    open = { who, group }
    out.push(group)
  }
  return out
}

/**
 * A group's changes as one sentence. A field changed more than once shows where it started and where it ended up; one
 * changed and then put back says so.
 */
export function groupText(g: ChangeGroup): string {
  const fields = new Map<TripChangeField, TripFieldChange>()
  const rooms: RoomsChange[] = []
  // Oldest first, so later saves win.
  for (const e of [...g.entries].reverse()) {
    if (e.change.what === 'rooms') rooms.push(e.change)
    if (e.change.what !== 'trip') continue
    for (const f of e.change.fields) {
      const was = fields.get(f.field)
      fields.set(f.field, was ? { ...f, from: was.from } : f)
    }
  }
  const shown: Shown[] = [...fields.values()].map((f) =>
    f.from !== undefined && f.from === f.to ? { ...f, back: true } : f
  )
  const clauses = editorClauses(shown, combineRooms(rooms))
  return `${changeActor(g.entries[0])} ${clauseList(clauses) || NOTHING_SHOWN}`
}
