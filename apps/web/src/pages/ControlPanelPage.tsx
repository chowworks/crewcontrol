import {
  BED_LABELS,
  BED_TYPES,
  type Guest,
  type GuestUpdate,
  type OrganizerTrip,
  type TripRoom,
} from '@cc/types'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'
import { RoomArt, sharingLine } from '@/components/RoomArt'
import { api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { PRICING_METHODS, paymentSchedule, priceRooms, type PricingMethod } from '@/lib/pricing'
import { signupOrder } from '@/lib/signups'

// The organizer's Trip Control panel. For now: the sign-up line, the trip's rooms, and a simulator for the price per person and
// the payment schedule. The simulator's money inputs (the lease total, what the organizer fronted) stay in this
// browser only, never on the server: they are the organizer's working numbers, not the trip's.

interface Sim {
  rent: string
  fees: string
  cover: string
  fronted: string
  method: PricingMethod
  /** People per room, by room (its id, or "new:<name>" before it's saved). Missing means full. */
  occupants: Record<string, number>
  installments: string
  firstDue: string
  deposit: string
}

const field =
  'w-full rounded-[10px] border border-[#5B6B80] bg-white px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

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

export function ControlPanelPage() {
  const { id = '' } = useParams()
  const [trip, setTrip] = useState<OrganizerTrip | null>(null)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  const [roomsMessage, setRoomsMessage] = useState<string | null>(null)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sim, setSim] = useState<Sim>(() => ({
    rent: '',
    fees: '',
    cover: '',
    fronted: '',
    method: 'hybrid',
    occupants: {},
    installments: '4',
    firstDue: '',
    deposit: '300',
    ...loadSim(id),
  }))

  useEffect(() => {
    Promise.all([api.getTrip(id), api.getRooms(id)])
      .then(([t, r]) => {
        setTrip(t)
        setRooms(r)
      })
      .catch(() => setError('This trip could not be loaded.'))
  }, [id])

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
                installments: Math.min(24, Math.max(1, Number(sim.installments) || 1)),
                firstDue: sim.firstDue,
                depositCents: cents(sim.deposit),
              }),
            }))
        : [],
    [pricing, sim]
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
  const fronted = cents(sim.fronted)
  const paidBack = fronted > 0 ? cash.find((c) => c.total >= fronted) : undefined

  // Every problem with the rooms, by row, shown beside the room before Save is pressed.
  const roomProblems = rooms.map((r) => roomProblem(r))
  const roomsOk = roomProblems.every((p) => !p)

  async function saveRooms() {
    if (!roomsOk) return
    setRoomsMessage(null)
    try {
      setRooms(await api.setRooms(id, rooms))
      // A removed room is cleared from its guests, so the sign-up list needs the fresh trip too.
      setTrip(await api.getTrip(id))
      setRoomsMessage('Rooms saved.')
    } catch (err) {
      setRoomsMessage(err instanceof Error ? err.message : 'Saving failed.')
    }
  }

  async function updateGuest(guest: Guest, update: GuestUpdate) {
    setGuestError(null)
    try {
      setTrip(await api.updateGuest(id, guest.id, update))
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'That change did not save.')
    }
  }

  const setRoom = (i: number, patch: Partial<TripRoom>) =>
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  if (error) return <p className="p-8 text-body">{error}</p>
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to={`/organize/${id}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Edit trip
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5">
        <div>
          <p className="text-sm font-semibold text-muted">Trip Control panel</p>
          <h1 className="text-3xl font-extrabold">{trip.name}</h1>
        </div>

        <SignupLine trip={trip} rooms={rooms} onUpdate={updateGuest} error={guestError} />

        <Card title="Rooms">
          <p className="text-body">
            Each room&apos;s weight sets its share of the price: 1 is the baseline, 1.5 pays half
            again as much. &ldquo;Priced for&rdquo; is the fewest people the room is sold to: fewer
            than that and they pay for the empty places too. Guests see the beds as a picture.
          </p>
          <div className="flex flex-col gap-3">
            {rooms.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-xl border border-rule p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] sm:items-end"
              >
                <Field label="Room">
                  <input
                    className={field}
                    value={r.name}
                    onChange={(e) => setRoom(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Beds">
                  <input
                    className={field}
                    value={r.beds}
                    onChange={(e) => setRoom(i, { beds: e.target.value })}
                  />
                </Field>
                <Field label="Sleeps">
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={20}
                    value={r.capacity}
                    onChange={(e) => setRoom(i, { capacity: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Weight">
                  <input
                    className={field}
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.05}
                    value={r.weight}
                    onChange={(e) => setRoom(i, { weight: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Priced for">
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={r.capacity}
                    value={r.minPeople}
                    onChange={(e) => setRoom(i, { minPeople: Number(e.target.value) })}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
                  aria-label={`Remove ${r.name || 'room'}`}
                  className="justify-self-start rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
                {roomProblems[i] && (
                  <p role="alert" className="col-span-full font-semibold text-[#B42318]">
                    {roomProblems[i]}
                  </p>
                )}
                <div className="col-span-full flex flex-wrap items-center gap-3">
                  <RoomArt beds={r.bedTypes} className="h-16 w-auto max-w-full" />
                  <div className="flex flex-col gap-1.5">
                    <span className="flex flex-wrap gap-1.5">
                      {BED_TYPES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setRoom(i, { bedTypes: [...r.bedTypes, b] })}
                          disabled={r.bedTypes.length >= 8}
                          className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale disabled:opacity-40"
                        >
                          + {BED_LABELS[b].label}
                        </button>
                      ))}
                      {r.bedTypes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setRoom(i, { bedTypes: r.bedTypes.slice(0, -1) })}
                          className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
                        >
                          Remove last bed
                        </button>
                      )}
                    </span>
                    <span className="text-sm text-muted">{sharingLine(r)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setRooms((rs) => [
                  ...rs,
                  { name: '', beds: '', capacity: 2, weight: 1, bedTypes: [], minPeople: 1 },
                ])
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add room
            </button>
            <button
              type="button"
              onClick={saveRooms}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark"
            >
              Save rooms
            </button>
            {!roomsOk ? (
              <span className="text-sm font-semibold text-[#B42318]">
                Fix the rooms marked above.
              </span>
            ) : (
              roomsMessage && <span className="text-sm text-body">{roomsMessage}</span>
            )}
          </div>
        </Card>

        <Card title="Price per person">
          <p className="text-body">
            A what-if calculator. Nothing here is saved to the trip or shown to guests, and the
            amounts stay in this browser.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rent">
              <Money value={sim.rent} onChange={(v) => set('rent', v)} />
            </Field>
            <Field label="Shared fees (deposit, cleaning, booking)">
              <Money value={sim.fees} onChange={(v) => set('fees', v)} />
            </Field>
            <Field label="You cover">
              <Money value={sim.cover} onChange={(v) => set('cover', v)} />
            </Field>
          </div>
          {rooms.some((r) => r.id && trip.guests.some((g) => g.roomId === r.id)) && (
            <button
              type="button"
              onClick={() =>
                set(
                  'occupants',
                  Object.fromEntries(
                    rooms.map((r) => [
                      roomKey(r),
                      trip.guests.filter((g) => g.roomId === r.id).length,
                    ])
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
              Add the trip&apos;s rooms above first.
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
        </Card>

        <Card title="Payment schedule">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Installments">
              <input
                className={field}
                type="number"
                min={1}
                max={24}
                value={sim.installments}
                onChange={(e) => set('installments', e.target.value)}
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
              {trip.startDate && cash.length > 0 && cash[cash.length - 1].date > trip.startDate && (
                <p className="rounded-xl bg-ground px-4 py-3 text-ink">
                  The last installment falls after the trip starts. Try fewer installments or an
                  earlier first due date.
                </p>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      {children}
    </label>
  )
}

function Money({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="flex items-stretch overflow-hidden rounded-[10px] border border-[#5B6B80] bg-white focus-within:ring-2 focus-within:ring-royal">
      <span className="flex items-center bg-ground px-3 font-normal text-muted">$</span>
      <input
        className="min-w-0 flex-1 px-3 py-2.5 text-base font-normal text-ink focus:outline-none"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </span>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-extrabold">{value}</dd>
      {note && <dd className="text-sm text-muted">{note}</dd>}
    </div>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Everyone who registered, in line order, with the spot cutoff where the trip has a limit. */
function SignupLine({
  trip,
  rooms,
  onUpdate,
  error,
}: {
  trip: OrganizerTrip
  rooms: TripRoom[]
  onUpdate: (guest: Guest, update: GuestUpdate) => void
  error: string | null
}) {
  const line = signupOrder(trip.guests)
  const confirmed = line.filter((g) => g.paymentConfirmedAt).length
  const max = trip.maxGuests
  return (
    <Card title="Sign-ups">
      <p className="text-body">
        {trip.payFirst
          ? 'Pay to register is on. Confirm each payment when it arrives: spots go in that order.'
          : 'Guests register for free; approve who comes.'}{' '}
        {max
          ? `${confirmed} of ${max} spots confirmed.`
          : `${confirmed} payments confirmed. No limit set.`}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          {error}
        </p>
      )}
      {line.length === 0 ? (
        <p className="rounded-xl bg-ground p-4 text-body">No one has signed up yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-2 font-semibold">#</th>
                <th className="py-2 font-semibold">Guest</th>
                {rooms.length > 0 && <th className="py-2 font-semibold">Room</th>}
                <th className="py-2 font-semibold">Says they paid</th>
                <th className="py-2 font-semibold">Payment arrived</th>
                <th className="py-2 font-semibold">Spot</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {line.map((g, i) => {
                const overLimit = Boolean(max && g.paymentConfirmedAt && i >= max)
                return (
                  <tr key={g.id} className="border-t border-rule align-top">
                    <td className="py-3 font-semibold">{i + 1}</td>
                    <td className="py-3">
                      <span className="font-semibold">
                        {g.firstName} {g.lastName}
                      </span>
                      <span className="block text-sm text-muted">
                        {g.phone} · {g.email}
                      </span>
                      <span className="block text-sm text-muted">
                        Signed up {when(g.createdAt)}
                      </span>
                    </td>
                    {rooms.length > 0 && (
                      <td className="py-3 text-sm">
                        <select
                          className="min-h-[44px] max-w-[180px] rounded-lg border border-rule bg-white px-2"
                          value={g.roomId ?? ''}
                          onChange={(e) => onUpdate(g, { roomId: e.target.value || null })}
                          aria-label={`Room for ${g.firstName}`}
                        >
                          <option value="">No room yet</option>
                          {rooms
                            .filter((r) => r.id)
                            .map((r) => {
                              const taken = trip.guests.filter((x) => x.roomId === r.id).length
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({taken}/{r.capacity})
                                </option>
                              )
                            })}
                        </select>
                        {g.roomNote && (
                          <span className="mt-1 block text-muted">Share with: {g.roomNote}</span>
                        )}
                      </td>
                    )}
                    <td className="py-3 text-sm">
                      {g.paymentSentAt ? when(g.paymentSentAt) : '—'}
                    </td>
                    <td className="py-3">
                      {g.paymentConfirmedAt ? (
                        <span className="flex flex-col items-start gap-1 text-sm">
                          <span className="font-semibold text-royal">
                            {when(g.paymentConfirmedAt)}
                          </span>
                          <UndoConfirm onUndo={() => onUpdate(g, { paymentConfirmed: false })} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpdate(g, { paymentConfirmed: true })}
                          className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
                        >
                          Confirm received
                        </button>
                      )}
                    </td>
                    <td className="py-3 text-sm">
                      {!g.paymentConfirmedAt
                        ? 'Waiting on payment'
                        : overLimit
                          ? 'Trip full: refund'
                          : 'Has a spot'}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate(g, {
                            status: g.status === 'approved' ? 'interested' : 'approved',
                          })
                        }
                        className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold ${
                          g.status === 'approved'
                            ? 'bg-royal text-white hover:bg-royal-dark'
                            : 'border border-royal text-royal hover:bg-royal-pale'
                        }`}
                      >
                        {g.status === 'approved' ? 'Approved' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/**
 * Undoing a confirmed payment loses the guest's place in line (confirming again stamps a new time), so it takes a
 * second tap that says so.
 */
function UndoConfirm({ onUndo }: { onUndo: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
      >
        Undo
      </button>
    )
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[#B42318]">They lose their place in line.</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark"
        >
          Undo payment
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
        >
          Keep
        </button>
      </span>
    </span>
  )
}

/** What's wrong with one room, in a line, or null. */
function roomProblem(r: TripRoom): string | null {
  if (!r.name.trim()) return 'Give this room a name.'
  if (!(r.capacity >= 1)) return 'A room sleeps at least 1.'
  if (!(r.weight > 0)) return 'Weight must be above 0 (1 is the baseline).'
  if (!(r.minPeople >= 1)) return '“Priced for” is at least 1.'
  if (r.minPeople > r.capacity) return '“Priced for” can’t be more than the room sleeps.'
  return null
}
