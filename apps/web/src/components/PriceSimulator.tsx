import { Lightbulb } from 'lucide-react'
import {
  paymentPlan,
  roomPrice,
  ROOMS_PRICED_APART,
  roomsPricedApart,
  type Guest,
  type RoomPricing,
  type TripRoom,
} from '@cc/types'
import { useEffect, useMemo, useState } from 'react'
import { Dropdown, REMIND_OPTIONS } from '@/components/Dropdown'
import { Card, Field, field, Money, Stat } from '@/components/EditorParts'
import { money, shortDate } from '@/lib/format'
import { priceRooms, spreadDates, type PricingMethod } from '@/lib/pricing'

// The price per person simulator and payment plan (step 4 of the trip editor). Its money inputs (the lease total,
// what the organizer fronted) stay in this browser only, never on the server: they are the organizer's working
// numbers, not the trip's.

interface Sim {
  rent: string
  fees: string
  cover: string
  fronted: string
  method: PricingMethod
  /** People per room, by room (its id, or "new:<name>" before it's saved). Missing means full. */
  occupants: Record<string, number>
}

const cents = (dollars: string) => Math.round((Number(dollars.replace(/[$,\s]/g, '')) || 0) * 100)

function loadSim(id: string): Partial<Sim> {
  try {
    const saved = JSON.parse(localStorage.getItem(`cc-sim-${id}`) ?? '{}') as Partial<Sim>
    // Older saves kept people per room as a list by position; start those fresh.
    if (Array.isArray(saved.occupants)) delete saved.occupants
    return saved
  } catch {
    return {}
  }
}

/** A room's key in the simulator: its id, or its name before it's saved. */
const roomKey = (r: TripRoom) => r.id ?? `new:${r.name}`

/** People in a room: what was typed, never more than it sleeps; a room with nothing typed is full. */
function occupantsFor(r: TripRoom | undefined, occupants: Record<string, number>): number {
  if (!r) return 0
  return Math.min(r.capacity, Math.max(0, occupants[roomKey(r)] ?? r.capacity))
}

/**
 * Price per person, worked out from the trip's rooms, and the Payment plan guests sign. The price guests see and the
 * plan (payments, due dates, split, reminders) are the trip's own, saved with it; the rest is the organizer's working
 * numbers.
 */
export function PriceSimulator({
  tripId,
  rooms,
  onRooms,
  roomPricing,
  guests,
  startDate,
  costCents,
  onCost,
  installments,
  onInstallments,
  dueDates,
  onDueDates,
  firstPaymentCents,
  onFirstPayment,
  depositKept,
  onDepositKept,
  depositKeptLocked,
  reminderDays,
  onReminderDays,
}: {
  tripId: string
  rooms: TripRoom[]
  /** Saves the rooms' prices when they come from the cost split by weight. */
  onRooms: (rooms: TripRoom[]) => void
  /** How the rooms are priced (step 3): the same, typed per room, or the cost split by weight here. */
  roomPricing: RoomPricing
  guests: Guest[]
  startDate: string
  costCents: number
  onCost: (cents: number) => void
  installments: number
  onInstallments: (n: number) => void
  dueDates: string[]
  onDueDates: (dates: string[]) => void
  firstPaymentCents: number | null
  onFirstPayment: (cents: number | null) => void
  /** The deposit isn't refunded when a guest drops out: the trip's "Keep the deposit" refund terms (step 3). */
  depositKept: boolean
  onDepositKept: (kept: boolean) => void
  /** Guests signed under the refund terms, so they can't change. */
  depositKeptLocked: boolean
  reminderDays: number | null
  onReminderDays: (days: number | null) => void
}) {
  const id = tripId
  const [sim, setSim] = useState<Sim>(() => ({
    rent: '',
    fees: '',
    cover: '',
    fronted: '',
    method: 'hybrid',
    occupants: {},
    ...loadSim(id),
  }))

  useEffect(() => {
    try {
      localStorage.setItem(`cc-sim-${id}`, JSON.stringify(sim))
    } catch {
      // Private windows can refuse storage; the simulator still works, it just won't remember.
    }
  }, [id, sim])

  const set = <K extends keyof Sim>(key: K, value: Sim[K]) =>
    setSim((s) => ({ ...s, [key]: value }))
  const occupantsOf = (i: number) => occupantsFor(rooms[i], sim.occupants)

  const pricing = useMemo(
    () =>
      priceRooms({
        rentCents: cents(sim.rent),
        feesCents: cents(sim.fees),
        coverCents: cents(sim.cover),
        // One price for everyone splits the cost evenly; weights split it by room (owner's decision, 2026-10-29).
        method: roomPricing === 'weights' ? 'tiered' : 'flat',
        rooms: rooms.map((r) => ({
          name: r.name,
          occupants: occupantsFor(r, sim.occupants),
          weight: r.weight,
          minPeople: r.minPeople,
        })),
      }),
    [rooms, sim, roomPricing]
  )

  // How the rooms are priced (step 3, owner's decision 2026-10-29). Typed: each room at its own price. Weights: the
  // cost split by each room's weight sets its price, saved to the rooms below. Same: one price, the cost split evenly.
  const typed = roomPricing === 'typed'
  const weighted = roomPricing === 'weights'
  const ownPrices = typed || weighted
  const eachPays = (i: number): number | undefined =>
    occupantsOf(i) > 0
      ? typed
        ? roomPrice(rooms[i], costCents)
        : pricing.rooms[i]?.perPersonCents
      : undefined
  const collectedCents = typed
    ? rooms.reduce((n, r, i) => n + roomPrice(r, costCents) * occupantsOf(i), 0)
    : pricing.collectedCents
  // Weights: each room's price is its share above, rounded to the dollar, kept on the room as the cost changes.
  const weightedPrices = rooms.map((_, i) =>
    occupantsOf(i) > 0 ? Math.round((pricing.rooms[i]?.perPersonCents ?? 0) / 100) * 100 : null
  )
  const weightedKey = JSON.stringify(weightedPrices)
  useEffect(() => {
    if (!weighted) return
    const next = rooms.map((r, i) => ({
      ...r,
      priceCents: weightedPrices[i] || r.priceCents || null,
    }))
    if (next.some((r, i) => r.priceCents !== rooms[i].priceCents)) onRooms(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weighted, weightedKey])

  // The plan guests sign, at the trip's price and at each room's own (issue #30); what the organizer collects with
  // everyone in the rooms above, each at their room's price.
  const planAt = (price: number) => paymentPlan(price, installments, firstPaymentCents, dueDates)
  const plan = planAt(costCents)
  const apart = roomsPricedApart(rooms, costCents)
  // One line per price, naming its rooms ("$500 · Casita 1, Casita 2").
  const prices = [...new Set(rooms.map((r) => roomPrice(r, costCents)))]
    .sort((a, b) => a - b)
    .map((price) => ({
      price,
      plan: planAt(price),
      rooms: rooms.filter((r) => roomPrice(r, costCents) === price).map((r) => r.name || 'Room'),
    }))
  let running = 0
  const cash = plan.map((p, k) => {
    const due = rooms.reduce(
      (n, r) => n + planAt(roomPrice(r, costCents))[k].amountCents * occupantsFor(r, sim.occupants),
      0
    )
    running += due
    return { date: p.dueOn, amount: p.amountCents, due, total: running }
  })
  const lowest = Math.min(costCents, ...rooms.map((r) => roomPrice(r, costCents)))

  // What the organizer collects shows only once the rooms above have people in them.
  const counting = pricing.people > 0
  const cols = counting ? 'sm:grid-cols-[1fr_1fr_1fr_1fr]' : 'sm:grid-cols-[1fr_1fr]'

  // The first and last due dates; until both are set (with more than one payment), they wait here unsaved.
  const [ends, setEnds] = useState({ first: '', last: '' })
  const first = dueDates[0] ?? ends.first
  const last =
    installments > 1 ? (dueDates.length > 1 ? dueDates[dueDates.length - 1] : ends.last) : first
  function changeEnds(f: string, l: string, n = installments) {
    setEnds({ first: f, last: l })
    if (n === 1) onDueDates(f ? [f] : [])
    else onDueDates(f && l && f <= l ? spreadDates(f, l, n) : [])
  }
  function changeCount(n: number) {
    onInstallments(n)
    changeEnds(first, installments === 1 ? ends.last : last, n)
  }

  // What each person pays on average at these prices, rounded to the dollar: a starting point for the price shown.
  const average =
    pricing.people > 0 ? Math.round(pricing.collectedCents / pricing.people / 100) * 100 : 0
  const fronted = cents(sim.fronted)
  const paidBack = fronted > 0 ? cash.find((c) => c.total >= fronted) : undefined

  return (
    <>
      <div className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
        <p className="flex items-center gap-3 font-semibold">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-royal">
            <Lightbulb className="h-5 w-5" aria-hidden="true" />
          </span>
          How pricing works
        </p>
        <div className="mt-2">
          <ol className="list-decimal pl-5 text-sm">
            <li>
              Enter what the trip costs: the rent, shared fees, and anything you cover yourself.
            </li>
            <li>
              {typed
                ? 'Each room has its own price, set in step 3. Put people in the rooms to see what you collect.'
                : weighted
                  ? 'Put people in the rooms: each room’s weight from step 3 sets its share, and so its price.'
                  : 'Put people in the rooms: everyone pays an even share.'}
            </li>
            <li>Check the price guests see, then set the payment plan.</li>
          </ol>
          <p className="mt-1 text-sm">
            The price guests see and the payment plan are saved to the trip, and go into the
            agreement guests sign. The rest is your working numbers, kept in this browser. Guests
            pay you directly; Travel HQ never handles the money.
          </p>
        </div>
      </div>

      <Card title="Work out the price">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rent" hint="The lease or booking total">
            <Money value={sim.rent} onChange={(v) => set('rent', v)} />
          </Field>
          <Field label="Shared fees" hint="Cleaning, booking, security deposit">
            <Money value={sim.fees} onChange={(v) => set('fees', v)} />
          </Field>
          <Field label="You cover" hint="What you pay yourself">
            <Money value={sim.cover} onChange={(v) => set('cover', v)} />
          </Field>
        </div>
        {rooms.some((r) => r.id && guests.some((g) => g.roomId === r.id)) && (
          <button
            type="button"
            onClick={() =>
              set(
                'occupants',
                Object.fromEntries(
                  rooms.map((r) => [roomKey(r), guests.filter((g) => g.roomId === r.id).length])
                )
              )
            }
            className="inline-flex min-h-[44px] items-center self-start rounded-xl border border-royal px-4 text-sm font-semibold text-royal hover:bg-royal-pale"
          >
            Fill in people per room from sign-ups
          </button>
        )}

        {rooms.length === 0 ? (
          <p className="rounded-xl bg-ground p-4 text-body">
            Add the trip&apos;s rooms in step 3 first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-muted">
                <tr>
                  <th className="py-2 font-semibold">Room</th>
                  <th className="py-2 font-semibold">People</th>
                  <th className="py-2 pl-3 text-right font-semibold">Each pays</th>
                  <th className="py-2 pl-3 text-right font-semibold">Room total</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r, i) => {
                  const people = occupantsOf(i)
                  const each = eachPays(i)
                  return (
                    <tr key={i} className="border-t border-rule">
                      <td className="py-2.5">
                        <span className="font-semibold">{r.name || 'Room'}</span>
                        <span className="block text-sm text-muted">{r.beds}</span>
                      </td>
                      <td className="py-2.5">
                        <input
                          className={`${field} w-20`}
                          type="number"
                          onFocus={(e) => e.target.select()}
                          min={0}
                          max={r.capacity}
                          value={people}
                          onChange={(e) => {
                            set('occupants', {
                              ...sim.occupants,
                              [roomKey(r)]: Math.min(
                                r.capacity,
                                Math.max(0, Number(e.target.value))
                              ),
                            })
                          }}
                          aria-label={`People in ${r.name || 'room'}`}
                        />
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold">
                        {each !== undefined ? money(each) : '—'}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        {each !== undefined ? money(each * people) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <dl className="grid gap-3 rounded-xl bg-ground p-4 sm:grid-cols-3">
          <Stat label="People going" value={String(pricing.people)} />
          <Stat label="The crew pays" value={money(pricing.costCents)} />
          <Stat
            label="Collected at these prices"
            value={money(collectedCents)}
            note={
              collectedCents === pricing.costCents
                ? undefined
                : typed
                  ? `${money(Math.abs(collectedCents - pricing.costCents))} ${collectedCents > pricing.costCents ? 'over' : 'short of'} the cost`
                  : `${money(Math.abs(collectedCents - pricing.costCents))} rounding`
            }
          />
        </dl>
        <div className="flex flex-col gap-3 border-t border-rule pt-4">
          <h3 className="text-lg font-extrabold">Price guests see</h3>
          {!ownPrices && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Per person, on the trip page">
                <span className="block w-48">
                  <Money
                    value={costCents ? String(costCents / 100) : ''}
                    onChange={(v) => onCost(cents(v))}
                  />
                </span>
              </Field>
              {average > 0 && average !== costCents && (
                <button
                  type="button"
                  onClick={() => onCost(average)}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-royal px-4 text-sm font-semibold text-royal hover:bg-royal-pale"
                >
                  Use {money(average)}, the average above
                </button>
              )}
            </div>
          )}
          {ownPrices && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Each room’s price, per person</span>
              <ul className="flex flex-col">
                {rooms.map((r) => (
                  <li
                    key={roomKey(r)}
                    className="flex items-center justify-between gap-2 border-t border-rule py-2"
                  >
                    <span className="font-semibold">{r.name || 'Room'}</span>
                    <span className="font-semibold">{money(roomPrice(r, costCents))}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
                {typed
                  ? 'Set in step 3, where each room has its own price.'
                  : 'Worked out above from each room’s weight, rounded to the dollar.'}
                {apart && ` ${ROOMS_PRICED_APART} The trip page shows “From ${money(lowest)}”.`}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Payment plan">
        <p className="text-body">
          The plan every guest signs: what they pay, and by when. Changing it later applies to new
          sign-ups only; guests who already signed keep the plan they agreed to.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Payments" hint="1 to 24">
            <input
              className={field}
              type="number"
              onFocus={(e) => e.target.select()}
              min={1}
              max={24}
              value={installments}
              onChange={(e) =>
                changeCount(Math.min(24, Math.max(1, Math.round(Number(e.target.value) || 1))))
              }
            />
          </Field>
          <Field
            label={installments === 1 ? 'Due by' : 'First one due'}
            hint={installments === 1 ? 'The whole price' : 'Payment 1'}
          >
            <input
              className={field}
              type="date"
              value={first}
              onChange={(e) => changeEnds(e.target.value, last)}
            />
          </Field>
          {installments > 1 && (
            <Field label="Last one due" hint="Others are spaced evenly">
              <input
                className={field}
                type="date"
                value={last}
                onChange={(e) => changeEnds(first, e.target.value)}
              />
            </Field>
          )}
        </div>
        {first && last && installments > 1 && first > last && (
          <p role="alert" className="text-sm font-semibold text-[#B42318]">
            The last payment can’t be due before the first.
          </p>
        )}
        {installments > 1 && (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field as="div" label="How to split it" hint="Even, or a deposit first">
              <Dropdown
                label="How to split it"
                value={firstPaymentCents === null ? 'even' : 'first'}
                options={[
                  { value: 'even', label: 'Even split' },
                  { value: 'first', label: 'Deposit first' },
                ]}
                onChange={(v) =>
                  onFirstPayment(v === 'even' ? null : Math.min(lowest, 30000) || null)
                }
              />
            </Field>
            {firstPaymentCents !== null && (
              <Field label="Deposit" hint="The rest is split evenly">
                <Money
                  value={String(firstPaymentCents / 100)}
                  onChange={(v) => onFirstPayment(cents(v) || null)}
                />
                {firstPaymentCents > lowest && (
                  <span role="alert" className="font-semibold text-[#B42318]">
                    More than the {apart ? 'lowest ' : ''}price, {money(lowest)}.
                  </span>
                )}
              </Field>
            )}
            {firstPaymentCents !== null && (
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={depositKept}
                  disabled={depositKeptLocked}
                  onChange={(e) => onDepositKept(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-royal"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">The deposit is non-refundable</span>
                  <span className="text-muted">
                    {depositKeptLocked
                      ? 'Locked: guests have already signed these refund terms.'
                      : 'A guest who drops out after you accept them doesn’t get it back. This is the same as “Keep the deposit” in step 3’s refund terms.'}
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        {costCents === 0 ? (
          <p className="rounded-xl bg-ground p-4 text-body">
            Set the price guests see above to see the plan.
          </p>
        ) : (
          <ol className="flex flex-col">
            <li className={`hidden gap-3 pb-2 text-sm font-semibold text-muted sm:grid ${cols}`}>
              <span>Due by</span>
              <span className="text-right">Each guest pays</span>
              {counting && <span className="text-right">You collect</span>}
              {counting && <span className="text-right">Running total</span>}
            </li>
            {cash.map((c, k) => (
              <li
                key={k}
                className={`grid grid-cols-2 items-center gap-x-3 gap-y-1 border-t border-rule py-2.5 ${cols}`}
              >
                <span className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                  <span className="text-sm font-semibold">
                    Payment {k + 1} of {plan.length}
                  </span>
                  {dueDates.length === plan.length ? (
                    <input
                      className={field}
                      type="date"
                      aria-label={`Payment ${k + 1} due by`}
                      value={dueDates[k]}
                      onChange={(e) =>
                        e.target.value &&
                        onDueDates(dueDates.map((d, j) => (j === k ? e.target.value : d)))
                      }
                    />
                  ) : (
                    <span className="text-sm text-muted">No date yet</span>
                  )}
                  {k > 0 && dueDates[k] && dueDates[k] < dueDates[k - 1] && (
                    <span role="alert" className="text-sm font-semibold text-[#B42318]">
                      Before payment {k}’s date.
                    </span>
                  )}
                </span>
                <span className="font-semibold sm:text-right">
                  <span className="block text-sm font-normal text-muted sm:hidden">
                    Each guest pays
                  </span>
                  {apart
                    ? prices.map((g) => (
                        <span key={g.price} className="block">
                          {money(g.plan[k].amountCents)}{' '}
                          <span className="text-sm font-normal text-muted">
                            {g.rooms.join(', ')}
                          </span>
                        </span>
                      ))
                    : money(c.amount)}
                </span>
                {counting && (
                  <span className="text-right">
                    <span className="block text-sm text-muted sm:hidden">
                      You collect, {pricing.people} going
                    </span>
                    {money(c.due)}
                  </span>
                )}
                {counting && (
                  <span
                    className={`hidden text-right font-semibold sm:block ${
                      fronted > 0 && c.total >= fronted ? 'text-royal' : ''
                    }`}
                  >
                    {money(c.total)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {startDate && dueDates.length > 0 && dueDates[dueDates.length - 1] > startDate && (
          <p className="rounded-xl bg-ground px-4 py-3 text-ink">
            The last payment falls after the trip starts. Try an earlier last due date.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field as="div" label="Email guests who still owe" hint="A reminder before each due date">
            <Dropdown
              label="Email guests who still owe"
              value={reminderDays}
              options={REMIND_OPTIONS}
              onChange={onReminderDays}
            />
          </Field>
          <Field label="You've fronted" hint="Only you see this">
            <Money value={sim.fronted} onChange={(v) => set('fronted', v)} />
          </Field>
        </div>
        {reminderDays !== null && dueDates.length === 0 && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            Reminders go out once the payments have due dates.
          </p>
        )}
        {fronted > 0 && counting && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            {paidBack
              ? paidBack.date
                ? `You get back the ${money(fronted)} you fronted by ${shortDate(paidBack.date)}, ${paidBack.date.slice(0, 4)}, if everyone pays on time.`
                : `You get back the ${money(fronted)} you fronted by payment ${cash.indexOf(paidBack) + 1}, if everyone pays on time.`
              : `After the last payment you are still ${money(fronted - (cash.at(-1)?.total ?? 0))} short of what you fronted.`}
          </p>
        )}
      </Card>
    </>
  )
}
