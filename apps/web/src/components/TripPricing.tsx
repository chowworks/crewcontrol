import {
  ownPartOf,
  type CostSplit,
  type Expense,
  type ExpenseInput,
  type TripOptions,
  type TripRoom,
} from '@cc/types'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useAdminView } from '@/components/AdminView'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Card, Field, Money } from '@/components/EditorParts'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { evenRoomPrice, evenSplit, fullRooms } from '@/lib/pricing'
import { ExpenseForm } from '@/pages/TripExpenses'

// The trip editor's Pricing step, top half (issue #65; owner's decisions, 2026-11-01): how the trip splits its cost,
// what the trip costs (its vendor costs, the same ones as Trip Financials), then the chosen way's fields. The payment
// plan and how to pay follow on the page.

const cents = (dollars: string) => Math.round((Number(dollars.replace(/[$,\s]/g, '')) || 0) * 100)
const dollars = (c: number) => (c ? String(c / 100) : '')
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-royal px-4 text-sm font-semibold text-royal hover:bg-royal-pale disabled:opacity-40'
const linkButton =
  'min-h-[44px] self-start font-semibold text-royal underline hover:text-royal-dark'
/** What a room's −/+ moves its price by: $25 under $500, $50 to $1,000, $100 above (owner's ask, 2026-11-01). */
const stepFor = (cents: number) => (cents < 50_000 ? 2500 : cents < 100_000 ? 5000 : 10_000)
/** A room's price in its box, with a thousands comma ("1,934"). */
const roomDollars = (c: number) => (c ? (c / 100).toLocaleString('en-US') : '')

const NUMBERS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "two guests' worth", "about 1.5 guests' worth": the organizer's part next to one guest's price. */
function worth(partCents: number, eachCents: number): string {
  const n = partCents / eachCents
  if (Number.isInteger(n)) return `${NUMBERS[n] ?? n} ${n === 1 ? 'guest’s' : 'guests’'} worth`
  return `about ${Math.round(n * 10) / 10} guests’ worth`
}

export const COST_SPLIT_LABELS: Record<CostSplit, string> = {
  even: 'Split the total evenly',
  room: 'Price by room',
  set: 'I know the price',
}

/** The three ways, each with a small picture. */
const WAYS: { value: CostSplit; label: string; hint: string; art: ReactNode }[] = [
  {
    value: 'even',
    label: COST_SPLIT_LABELS.even,
    hint: 'Everyone pays the same share of what the trip costs.',
    art: (
      <svg viewBox="0 0 56 44" aria-hidden="true" className="h-9 w-11">
        <circle cx="28" cy="22" r="18" fill="#fff" stroke="currentColor" strokeWidth="2" />
        <path
          d="M28 22V4M28 22l15.6 9M28 22l-15.6 9"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    value: 'room',
    label: COST_SPLIT_LABELS.room,
    hint: 'Bigger rooms cost more. Guests pick a room when they join.',
    art: (
      <svg viewBox="0 0 56 44" aria-hidden="true" className="h-9 w-11">
        <rect
          x="3"
          y="10"
          width="22"
          height="28"
          rx="3"
          fill="#EFE8F8"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="29"
          y="20"
          width="12"
          height="18"
          rx="3"
          fill="#fff"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="43"
          y="24"
          width="10"
          height="14"
          rx="3"
          fill="#fff"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    value: 'set',
    label: COST_SPLIT_LABELS.set,
    hint: 'You type what each guest pays.',
    art: (
      <svg viewBox="0 0 56 44" aria-hidden="true" className="h-9 w-11">
        <rect
          x="8"
          y="8"
          width="40"
          height="28"
          rx="6"
          fill="#EFE8F8"
          stroke="currentColor"
          strokeWidth="2"
        />
        <text
          x="28"
          y="27"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontWeight="700"
          fontSize="15"
          fill="currentColor"
        >
          $
        </text>
      </svg>
    ),
  },
]

/** − value + : a value moved a step down or up by its buttons. */
function Stepper({
  label,
  onStep,
  children,
  wide = false,
}: {
  label: string
  onStep: (by: -1 | 1) => void
  /** The middle: what the value reads as. */
  children: ReactNode
  wide?: boolean
}) {
  const side =
    'grid w-11 shrink-0 place-items-center bg-ground text-royal hover:bg-royal-pale disabled:opacity-40'
  return (
    <span
      className={`flex min-h-[44px] items-stretch overflow-hidden rounded-[10px] border border-[#5B6B80] bg-white ${wide ? 'w-full' : 'w-[168px]'}`}
    >
      <button
        type="button"
        className={side}
        aria-label={`Less: ${label}`}
        onClick={() => onStep(-1)}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="flex min-w-0 flex-1 items-center justify-center">{children}</span>
      <button
        type="button"
        className={side}
        aria-label={`More: ${label}`}
        onClick={() => onStep(1)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  )
}

/** The royal block with the answer: "Each guest pays $250". */
function Result({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-royal px-4 py-3.5 text-white">
      <span className="text-sm opacity-90">{label}</span>
      <span className="font-display text-3xl font-extrabold">{value}</span>
      {children && <span className="text-sm opacity-90">{children}</span>}
    </div>
  )
}

/**
 * The end of Pricing (issue #65; owner's decision, 2026-11-01): a summary of what's set, not live tracking, which
 * stays out of Trip Control. What the organizer paid vendors up front, less their own part, is what the crew owes
 * them back; what's still to buy comes out of the guests' payments after that.
 */
/**
 * The plan's money in one place: the costs going out against what the guests and the organizer put in. The Pricing
 * step's summary, and Trip Financials' "Costs vs collecting" (owner's asks, 2026-11-01). It's the plan, not the
 * payments that arrived.
 */
export function summaryOf({
  options,
  costCents,
  maxGuests,
  going,
  rooms,
}: {
  options: TripOptions
  costCents: number
  maxGuests: number | null
  going: boolean
  rooms: TripRoom[]
}) {
  const limitGuests = maxGuests ? Math.max(1, maxGuests - (going ? 1 : 0)) : 0
  const guests = options.splitGuests ?? (limitGuests || 1)
  const byRoom = options.costSplit === 'room'
  return {
    guests,
    ownPartCents: ownPartOf(options),
    each: byRoom
      ? rooms
          .map((r) => `${r.name || 'Room'} ${r.capacity} × ${money(r.priceCents ?? 0)}`)
          .join(', ')
      : `${guests} × ${money(costCents)}`,
    crewCents: byRoom ? fullRooms(rooms) : costCents * guests,
    crewLabel: byRoom ? 'Rooms full' : `${guests} ${guests === 1 ? 'guest' : 'guests'}`,
  }
}

export function CostSummary({
  expenses,
  ownPartCents,
  each,
  crewCents,
  crewLabel,
}: {
  expenses: Expense[]
  /** What the organizer puts in themselves (an even split's "You put in"). */
  ownPartCents: number
  /** How the guests' part is made up: "5 guests at $250", "Rooms full, from $1,884". */
  each: string
  /** What the guests pay in all, with the trip full. */
  crewCents: number
  /** Who that is: "5 guests", "Rooms full". */
  crewLabel: string
}) {
  const paid = expenses.filter((e) => e.paidOn).reduce((n, e) => n + e.amountCents, 0)
  const owed = expenses.filter((e) => !e.paidOn).reduce((n, e) => n + e.amountCents, 0)
  const line = (label: string, note: string, value: string, strong = false) => (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className={strong ? 'font-semibold' : ''}>{label}</span>
        {note && <span className="text-sm text-muted">{note}</span>}
      </span>
      <span className="shrink-0 font-semibold">{value}</span>
    </li>
  )
  // Paying out against collecting (owner's ask, 2026-11-01): one bar as long as the trip's costs, filled by the guests
  // and the organizer's own part; past its end what's collected over, or the gap left short.
  const out = paid + owed
  const collect = crewCents + ownPartCents
  const extra = Math.max(0, collect - out)
  const short = Math.max(0, out - collect)
  const scale = Math.max(out, collect, 1)
  const pct = (c: number) => `${(c / scale) * 100}%`
  const segments: [number, string, string][] = [
    [Math.min(ownPartCents, out), 'bg-marigold', 'You'],
    [Math.max(0, crewCents - extra), 'bg-royal', crewLabel],
    [extra, 'bg-royal/40', 'Extra'],
    [short, 'bg-marigold/50', 'Cover'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-rule p-4">
        <div className="flex flex-wrap justify-between gap-x-3 text-sm">
          <span>
            You pay out <strong>{money(out)}</strong>
          </span>
          <span>
            You collect <strong>{money(collect)}</strong>
          </span>
        </div>
        <div className="relative">
          <span
            role="img"
            aria-label={`Costs ${money(out)}; collected ${money(collect)}${extra ? `, ${money(extra)} extra` : ''}${short ? `, you cover ${money(short)}` : ''}`}
            className="flex h-6 overflow-hidden rounded-full bg-ground"
          >
            {segments.map(([c, cls, name]) =>
              c > 0 ? (
                <span key={name} className={`h-full ${cls}`} style={{ width: pct(c) }} />
              ) : null
            )}
          </span>
          {extra > 0 && (
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -top-1 w-0.5 bg-ink"
              style={{ left: pct(out) }}
            />
          )}
        </div>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {segments
            .filter(([c]) => c > 0)
            .map(([c, cls, name]) => (
              <span key={name} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />
                {name === 'Extra'
                  ? `+${money(c)} extra`
                  : name === 'Cover'
                    ? `You cover ${money(c)}`
                    : `${name} ${money(c)}`}
              </span>
            ))}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Going out</h3>
          <ul className="flex flex-col divide-y divide-rule">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="truncate">{e.payee}</span>
                  <span
                    className={`rounded-full px-2 text-xs font-semibold ${
                      e.paidOn ? 'bg-royal-pale text-royal' : 'bg-[#FDF0D5] text-[#7A5200]'
                    }`}
                  >
                    {e.paidOn ? 'Paid' : 'To buy'}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{money(e.amountCents)}</span>
              </li>
            ))}
            {line('Total', '', money(out), true)}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Coming in</h3>
          <ul className="flex flex-col divide-y divide-rule">
            {line('Guests', each, money(crewCents))}
            {ownPartCents > 0 && line('Your part', 'What you put in', money(ownPartCents))}
            {line('Total', '', money(collect), true)}
          </ul>
        </section>
      </div>
      <p className={`font-semibold ${short ? 'text-[#7A5200]' : 'text-royal'}`}>
        {short
          ? `You cover ${money(short)} of the ${money(out)} the trip costs.`
          : extra
            ? `+${money(extra)} extra over the ${money(out)} the trip costs.`
            : 'What you collect covers what the trip costs.'}
      </p>
    </div>
  )
}

export function PricingStep({
  tripId,
  options,
  setOptions,
  costCents,
  onCost,
  maxGuests,
  going,
  rooms,
  setRooms,
}: {
  tripId: string
  options: TripOptions
  setOptions: (patch: Partial<TripOptions>) => void
  /** The price guests see (the trip's price). */
  costCents: number
  onCost: (cents: number) => void
  /** The guest limit from step 2. */
  maxGuests: number | null
  /** The organizer is going (issue #53), and takes one of the spots. */
  going: boolean
  rooms: TripRoom[]
  setRooms: (update: (rooms: TripRoom[]) => TripRoom[]) => void
}) {
  const admin = useAdminView()
  const toast = useToast()
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [removing, setRemoving] = useState<Expense | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getExpenses(tripId, admin).then(setExpenses, () => setExpenses([]))
  }, [tripId, admin])

  const way = options.costSplit
  const total = (expenses ?? []).reduce((n, e) => n + e.amountCents, 0)
  // Guests who share the cost: what the organizer set, or the guest limit less the organizer's own spot.
  const summary = summaryOf({ options, costCents, maxGuests, going, rooms })
  const { guests } = summary
  const each = evenSplit(total, options.ownPartCents, guests)

  // An even split sets the price guests see as the costs or the counts change.
  useEffect(() => {
    if (way === 'even' && each > 0 && each !== costCents) onCost(each)
  }, [way, each, costCents, onCost])

  function apply(next: CostSplit) {
    // Price by room: guests pick their room, so they sign its price. Each room without a price starts from an even
    // split. Leaving it, rooms go back to the trip's one price.
    if (next === 'room') {
      const start = evenRoomPrice(total, rooms) || costCents || null
      setRooms((rs) => rs.map((r) => ({ ...r, priceCents: r.priceCents ?? start })))
      setOptions({ costSplit: next, roomChoice: true, roomRequired: true })
    } else {
      if (way === 'room') setRooms((rs) => rs.map((r) => ({ ...r, priceCents: null })))
      setOptions({ costSplit: next })
    }
  }
  // No lock and no question here (owner's decisions, 2026-11-01): the editor says who signed when it saves.
  const choose = (next: CostSplit) => (next === way ? undefined : apply(next))

  async function save(change: () => Promise<Expense[]>): Promise<boolean> {
    setError(null)
    try {
      setExpenses(await change())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
      return false
    }
  }

  async function submit(form: ExpenseInput) {
    const before = editing
    const saved = await save(() =>
      before && before !== 'new'
        ? api.updateExpense(tripId, before.id, form)
        : api.addExpense(tripId, form)
    )
    if (!saved) return false
    setEditing(null)
    // A cost is a vendor cost: Trip Financials shows it from now on.
    if (!options.vendorCosts) setOptions({ vendorCosts: true })
    toast({
      text:
        before === 'new'
          ? `${form.payee}, ${money(form.amountCents)}, added.`
          : `${form.payee} updated.`,
    })
    return true
  }

  async function remove(e: Expense) {
    setRemoving(null)
    if (!(await save(() => api.removeExpense(tripId, e.id)))) return
    setEditing(null)
    toast({
      text: `${e.payee} removed.`,
      action: {
        label: 'Undo',
        onClick: () =>
          void save(() =>
            api.addExpense(tripId, {
              payee: e.payee,
              description: e.description,
              amountCents: e.amountCents,
              paidOn: e.paidOn,
              dueOn: e.dueOn,
            })
          ),
      },
    })
  }

  /** One −/+ press: down by the step below the price, up by the step at it, never under $25. */
  const roomStep = (price: number, by: -1 | 1) =>
    Math.max(2500, by > 0 ? price + stepFor(price) : price - stepFor(Math.max(0, price - 1)))
  const setRoomPrice = (i: number, price: number) =>
    setRooms((rs) =>
      rs.map((r, j) => (j === i ? { ...r, priceCents: price > 0 ? price : null } : r))
    )
  const collected = fullRooms(rooms)
  const gap = collected - total
  const known = costCents * guests
  const noCosts = expenses !== null && expenses.length === 0
  const lowestRoom = Math.min(...rooms.map((r) => r.priceCents || Infinity))
  const fromPrice = Number.isFinite(lowestRoom) ? lowestRoom : 0

  return (
    <>
      <Card title="How does this trip split the cost?">
        <div
          role="radiogroup"
          aria-label="How the trip splits the cost"
          className="grid gap-2 sm:grid-cols-3"
        >
          {WAYS.map((w) => (
            <button
              key={w.value}
              type="button"
              role="radio"
              aria-checked={way === w.value}
              disabled={admin}
              onClick={() => choose(w.value)}
              className={`grid min-h-[44px] grid-cols-[44px_1fr] items-center gap-3 rounded-xl border-2 p-3 text-left sm:grid-cols-1 sm:content-start sm:items-start ${
                way === w.value
                  ? 'border-royal bg-royal-pale'
                  : 'border-rule bg-white hover:border-royal'
              }`}
            >
              <span className="flex h-9 items-center text-royal">{w.art}</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-ink">{w.label}</span>
                <span className="text-sm text-body">{w.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="What the trip costs">
        {error && !editing && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {expenses === null ? (
          <p className="text-muted">Loading the costs…</p>
        ) : expenses.length === 0 ? (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
            {way === 'set'
              ? 'Optional here: add the house, the food and the rest to see how your price compares.'
              : 'Add the house, the food and the rest: the price is worked out from the total.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{e.payee}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    {e.description && <span>{e.description}</span>}
                    <span
                      className={`rounded-full px-2 text-xs font-semibold ${
                        e.paidOn ? 'bg-royal-pale text-royal' : 'bg-[#FDF0D5] text-[#7A5200]'
                      }`}
                    >
                      {e.paidOn
                        ? `Paid ${shortDate(e.paidOn)}`
                        : e.dueOn
                          ? `To buy by ${shortDate(e.dueOn)}`
                          : 'To buy'}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{money(e.amountCents)}</span>
                {!admin && (
                  <button type="button" className={outlined} onClick={() => setEditing(e)}>
                    Edit
                  </button>
                )}
              </li>
            ))}
            <li className="flex justify-between border-t-2 border-ink pt-2.5 font-semibold">
              <span>Total</span>
              <span>{money(total)}</span>
            </li>
          </ul>
        )}
        {!admin && (
          <button type="button" className={outlined} onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {noCosts ? 'Add a cost' : 'Add another cost'}
          </button>
        )}
        <p className="text-sm text-muted">
          Only you and the trip’s organizers see these, as vendor costs in Trip Financials. Guests
          see the price.
        </p>
      </Card>

      {way === 'even' && (
        <Card title="Split the total evenly">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="You put in"
              hint={`Your own part${total ? ` of the ${money(total)}` : ''}, if you’re chipping in`}
            >
              <Money
                value={dollars(options.ownPartCents)}
                onChange={(v) => setOptions({ ownPartCents: cents(v) })}
              />
            </Field>
            <Field
              as="div"
              label="Guests split the rest"
              hint={
                maxGuests
                  ? `From the guest limit in step 2${going ? ', less your own spot' : ''}`
                  : 'Set a guest limit in step 2, or count them here'
              }
            >
              <Stepper
                wide
                label="guests"
                onStep={(by) =>
                  setOptions({ splitGuests: Math.min(1000, Math.max(1, guests + by)) })
                }
              >
                {guests} {guests === 1 ? 'guest' : 'guests'}
              </Stepper>
            </Field>
          </div>
          {total === 0 ? (
            <p className="rounded-xl bg-ground px-4 py-3 text-body">
              Add what the trip costs above to work out the price.
            </p>
          ) : each === 0 ? (
            <p className="rounded-xl bg-ground px-4 py-3 text-body">
              You’re putting in the whole {money(total)}, so there’s nothing for guests to split.
            </p>
          ) : (
            <Result label="Each guest pays" value={money(each)}>
              {guests} {guests === 1 ? 'guest pays' : 'guests pay'} {money(each * guests)}.
              {options.ownPartCents > 0 &&
                ` Your ${money(options.ownPartCents)} is ${worth(options.ownPartCents, each)}.`}
            </Result>
          )}
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
            If fewer than {guests} sign up, you cover the gap. Guests keep the price they signed.
          </p>
        </Card>
      )}

      {way === 'room' && (
        <Card title="Price by room">
          {rooms.length === 0 ? (
            <p className="rounded-xl bg-ground px-4 py-3 text-body">
              Add the trip’s rooms in step 3 first.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span>
                    Rooms full: you collect <strong>{money(collected)}</strong>
                  </span>
                  {total > 0 && (
                    <span className={`font-semibold ${gap < 0 ? 'text-[#B42318]' : 'text-royal'}`}>
                      {gap === 0
                        ? 'Matches the cost'
                        : `${money(Math.abs(gap))} ${gap < 0 ? 'short' : 'over'}`}
                    </span>
                  )}
                </div>
                {total > 0 && (
                  <>
                    <span
                      role="img"
                      aria-label={`${money(collected)} of the ${money(total)} the trip costs`}
                      className="h-2.5 overflow-hidden rounded-full bg-rule"
                    >
                      <span
                        className="block h-full rounded-full bg-royal"
                        style={{ width: `${Math.min(100, (collected / total) * 100)}%` }}
                      />
                    </span>
                    <span className="text-sm text-muted">Of the {money(total)} the trip costs</span>
                  </>
                )}
              </div>
              <ul className="flex flex-col divide-y divide-rule">
                {rooms.map((r, i) => (
                  <li
                    key={r.id ?? i}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{r.name || 'Room'}</span>
                      <span className="text-sm text-muted">
                        {r.beds ? `${r.beds} · ` : ''}sleeps {r.capacity}
                      </span>
                      {!(r.priceCents && r.priceCents > 0) && (
                        <span role="alert" className="text-sm font-semibold text-[#B42318]">
                          Give this room a price per person.
                        </span>
                      )}
                    </span>
                    <Stepper
                      label={`${r.name || 'room'} price`}
                      onStep={(by) => setRoomPrice(i, roomStep(r.priceCents ?? 0, by))}
                    >
                      <span className="flex items-center">
                        <span className="text-muted">$</span>
                        <input
                          className="w-20 bg-transparent text-center text-base font-semibold text-ink focus:outline-none"
                          inputMode="decimal"
                          aria-label={`${r.name || 'Room'} price per person`}
                          value={roomDollars(r.priceCents ?? 0)}
                          onChange={(e) => setRoomPrice(i, cents(e.target.value))}
                        />
                      </span>
                    </Stepper>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={outlined}
                disabled={total === 0}
                onClick={() => {
                  const price = evenRoomPrice(total, rooms)
                  setRooms((rs) => rs.map((r) => ({ ...r, priceCents: price })))
                }}
              >
                Start from an even split
              </button>
              <p className="text-sm text-muted">
                Per person. The buttons move a price by $25, $50 above $500 and $100 above $1,000.
                Guests pick a room when they join, and the trip page shows “From {money(fromPrice)}
                ”.
              </p>
            </>
          )}
        </Card>
      )}

      {way === 'set' && (
        <Card title="I know the price">
          <Field label="Each guest pays">
            <span className="block sm:w-48">
              <Money value={dollars(costCents)} onChange={(v) => onCost(cents(v))} />
            </span>
          </Field>
          {costCents > 0 && (maxGuests !== null || options.splitGuests !== null) && (
            <Result
              label={`With ${guests} ${guests === 1 ? 'guest' : 'guests'} you collect`}
              value={money(known)}
            >
              {total === 0
                ? null
                : known < total
                  ? `You cover ${money(total - known)} of the ${money(total)} the trip costs.`
                  : known > total
                    ? `${money(known - total)} more than the ${money(total)} the trip costs.`
                    : 'Exactly what the trip costs.'}
            </Result>
          )}
          {total > 0 && known > total && !admin && (
            <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
              Collecting extra for something specific?{' '}
              <button
                type="button"
                className="font-semibold text-royal underline"
                onClick={() => setEditing('new')}
              >
                Add it as a cost
              </button>{' '}
              so you can see what it’s for.
            </p>
          )}
          {!admin && (
            <button type="button" className={linkButton} onClick={() => choose('even')}>
              Split it for me instead
            </button>
          )}
        </Card>
      )}

      {expenses && expenses.length > 0 && (
        <Card title="Paying you back">
          <CostSummary expenses={expenses} {...summary} />
        </Card>
      )}
      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          error={error}
          onSubmit={submit}
          onRemove={(e) => setRemoving(e)}
          onClose={() => {
            setEditing(null)
            setError(null)
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.payee}, ${money(removing.amountCents)}?`}
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p>It comes off what the trip costs and off Trip Financials.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
