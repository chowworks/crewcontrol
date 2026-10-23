import type { Guest, TripRoom } from '@cc/types'
import { useEffect, useMemo, useState } from 'react'
import { Card, Field, field, Money, Stat } from '@/components/EditorParts'
import { money, shortDate } from '@/lib/format'
import { PRICING_METHODS, paymentSchedule, priceRooms, type PricingMethod } from '@/lib/pricing'

// The price per person and payment schedule simulator (step 4 of the trip editor). Its money inputs (the lease total,
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
  firstDue: string
  deposit: string
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
 * Price per person and Payment schedule, worked out from the trip's rooms. The price guests see and the number of
 * installments are the trip's own (saved with it); the rest is the organizer's working numbers.
 */
export function PriceSimulator({
  tripId,
  rooms,
  guests,
  startDate,
  costCents,
  onCost,
  installments,
  onInstallments,
}: {
  tripId: string
  rooms: TripRoom[]
  guests: Guest[]
  startDate: string
  costCents: number
  onCost: (cents: number) => void
  installments: number
  onInstallments: (n: number) => void
}) {
  const id = tripId
  const [sim, setSim] = useState<Sim>(() => ({
    rent: '',
    fees: '',
    cover: '',
    fronted: '',
    method: 'hybrid',
    occupants: {},
    firstDue: '',
    deposit: '300',
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
        method: sim.method,
        rooms: rooms.map((r) => ({
          name: r.name,
          occupants: occupantsFor(r, sim.occupants),
          weight: r.weight,
          minPeople: r.minPeople,
        })),
      }),
    [rooms, sim]
  )

  const schedules = useMemo(
    () =>
      sim.firstDue
        ? pricing.rooms
            .filter((r) => r.occupants > 0)
            .map((r) => ({
              ...r,
              installments: paymentSchedule({
                perPersonCents: r.perPersonCents,
                installments: Math.min(24, Math.max(1, installments)),
                firstDue: sim.firstDue,
                depositCents: cents(sim.deposit),
              }),
            }))
        : [],
    [pricing, sim, installments]
  )

  // What the organizer has collected after each due date, against what they fronted.
  const cash = useMemo(() => {
    if (!schedules.length) return []
    let total = 0
    return schedules[0].installments.map((inst, k) => {
      const due = schedules.reduce((n, s) => n + s.installments[k].amountCents * s.occupants, 0)
      total += due
      return { date: inst.date, due, total }
    })
  }, [schedules])
  // What each person pays on average at these prices, rounded to the dollar: a starting point for the price shown.
  const average =
    pricing.people > 0 ? Math.round(pricing.collectedCents / pricing.people / 100) * 100 : 0
  const fronted = cents(sim.fronted)
  const paidBack = fronted > 0 ? cash.find((c) => c.total >= fronted) : undefined

  return (
    <>
      <div className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
        <p className="flex items-center gap-3 font-semibold">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-royal text-lg"
            aria-hidden="true"
          >
            💡
          </span>
          How pricing works
        </p>
        <div className="mt-2">
          <ol className="list-decimal pl-5 text-sm">
            <li>
              Enter what the trip costs: the rent, shared fees, and anything you cover yourself.
            </li>
            <li>Pick how to split it. The rooms from step 3 set each room&apos;s share.</li>
            <li>Set the price guests see, then the payment schedule.</li>
          </ol>
          <p className="mt-1 text-sm">
            Only the price guests see and the number of installments are saved to the trip. The rest
            is your working numbers, kept in this browser. Guests pay you directly; CrewControl
            never handles the money.
          </p>
        </div>
      </div>

      <Card title="Price per person">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rent" hint="The lease or booking total">
            <Money value={sim.rent} onChange={(v) => set('rent', v)} />
          </Field>
          <Field label="Shared fees" hint="Deposit, cleaning, booking">
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">How to split it</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRICING_METHODS.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border-2 p-3 ${
                  sim.method === m.value ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="method"
                    checked={sim.method === m.value}
                    onChange={() => set('method', m.value)}
                    className="accent-royal"
                  />
                  {m.label}
                </span>
                <span className="text-sm text-body">{m.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {rooms.length === 0 ? (
          <p className="rounded-xl bg-ground p-4 text-body">
            Add the trip&apos;s rooms in step 3 first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="text-sm text-muted">
                <tr>
                  <th className="py-2 font-semibold">Room</th>
                  <th className="py-2 font-semibold">People</th>
                  <th className="py-2 text-right font-semibold">Each pays</th>
                  <th className="py-2 text-right font-semibold">Room total</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r, i) => {
                  const people = occupantsOf(i)
                  const each = people > 0 ? pricing.rooms[i]?.perPersonCents : undefined
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
                      <td className="py-2.5 text-right font-semibold">
                        {each !== undefined ? money(each) : '—'}
                      </td>
                      <td className="py-2.5 text-right">
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
            value={money(pricing.collectedCents)}
            note={
              pricing.collectedCents !== pricing.costCents
                ? `${money(Math.abs(pricing.collectedCents - pricing.costCents))} rounding`
                : undefined
            }
          />
        </dl>
        <div className="flex flex-col gap-3 border-t border-rule pt-4">
          <h3 className="text-lg font-extrabold">Price guests see</h3>
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
          <p className="text-sm text-muted">
            With rooms priced differently, put the price most people pay.
          </p>
        </div>
      </Card>

      <Card title="Payment schedule">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Installments">
            <input
              className={field}
              type="number"
              min={1}
              max={24}
              value={installments}
              onChange={(e) =>
                onInstallments(Math.min(24, Math.max(1, Math.round(Number(e.target.value) || 1))))
              }
            />
          </Field>
          <Field label="First one due">
            <input
              className={field}
              type="date"
              value={sim.firstDue}
              onChange={(e) => set('firstDue', e.target.value)}
            />
          </Field>
          <Field label="First installment">
            <Money value={sim.deposit} onChange={(v) => set('deposit', v)} />
          </Field>
          <Field label="You've fronted">
            <Money value={sim.fronted} onChange={(v) => set('fronted', v)} />
          </Field>
        </div>

        {!sim.firstDue || schedules.length === 0 ? (
          <p className="rounded-xl bg-ground p-4 text-body">
            Set the prices above and a first due date to see the schedule.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="text-sm text-muted">
                  <tr>
                    <th className="py-2 font-semibold">Due</th>
                    {schedules.map((s, i) => (
                      <th key={i} className="py-2 text-right font-semibold">
                        {s.name}
                      </th>
                    ))}
                    <th className="py-2 text-right font-semibold">You collect</th>
                    <th className="py-2 text-right font-semibold">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {cash.map((c, k) => (
                    <tr key={c.date} className="border-t border-rule">
                      <td className="py-2.5 font-semibold">
                        {shortDate(c.date)}, {c.date.slice(0, 4)}
                      </td>
                      {schedules.map((s, i) => (
                        <td key={i} className="py-2.5 text-right">
                          {money(s.installments[k].amountCents)}
                        </td>
                      ))}
                      <td className="py-2.5 text-right">{money(c.due)}</td>
                      <td
                        className={`py-2.5 text-right font-semibold ${
                          fronted > 0 && c.total >= fronted ? 'text-royal' : ''
                        }`}
                      >
                        {money(c.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fronted > 0 && (
              <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
                {paidBack
                  ? `You get back the ${money(fronted)} you fronted by ${shortDate(paidBack.date)}, ${paidBack.date.slice(0, 4)}, if everyone pays on time.`
                  : `After the last installment you are still ${money(fronted - (cash.at(-1)?.total ?? 0))} short of what you fronted.`}
              </p>
            )}
            {startDate && cash.length > 0 && cash[cash.length - 1].date > startDate && (
              <p className="rounded-xl bg-ground px-4 py-3 text-ink">
                The last installment falls after the trip starts. Try fewer installments or an
                earlier first due date.
              </p>
            )}
          </>
        )}
      </Card>
    </>
  )
}
