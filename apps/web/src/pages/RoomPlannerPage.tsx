import {
  BED_LABELS,
  BED_TYPES,
  planPlaces,
  type InterestedPerson,
  type OrganizerTrip,
  type RoomPlanLayout,
  type RoomPlanMove,
  type TripRoom,
} from '@cc/types'
import {
  ArrowLeft,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  LoaderCircle,
  Lock,
  Share2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { useAdminFallback, useAdminView } from '@/components/AdminView'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { Card, Field, Money, field } from '@/components/EditorParts'
import { HelpButton } from '@/components/HelpButton'
import { Logo } from '@/components/Logo'
import { RoomArt } from '@/components/RoomArt'
import { roomProblem } from '@/components/RoomsEditor'
import { useToast } from '@/components/Toast'
import { ApiError, api } from '@/lib/api'
import { notPlaced, spotPerson, tripPeople, type Person } from '@/lib/roomPlan'
import { ApplyRoomsDialog, ShareFloorPlanDialog } from './RoomPlanApply'
import { Chip, PlannerBoard } from './RoomPlanner'

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-royal bg-royal px-4 font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60'

const sharedDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const savedAt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The room planner (issue #93, a paid feature): the house laid out on dots, people dragged onto beds, saved as a draft
 * and applied to the trip when the organizer has decided. A computer does the planning; a phone shows the plan as a
 * list.
 */
export function RoomPlannerPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  // The admin plans on any trip to help its organizers, but never saves or applies (owner's decision, 2026-11-20).
  const admin = useAdminView()
  const toAdminView = useAdminFallback(id, 'planner')
  const [trip, setTrip] = useState<OrganizerTrip | null>(null)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  const [interest, setInterest] = useState<InterestedPerson[]>([])
  const [layout, setLayoutState] = useState<RoomPlanLayout | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  // When accepted guests were last shown the floor plan, or null while they can't see it.
  const [sharedAt, setSharedAt] = useState<string | null>(null)
  // Whether accepted guests see who sleeps where on it, or everyone sees it with no names.
  const [sharedNames, setSharedNames] = useState(true)
  // Share on trip page is open, for the draft saved at this time.
  const [sharing, setSharing] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // The moves Apply shows, and when the draft they come from was saved (Apply refuses if it changed since).
  const [moves, setMoves] = useState<{ list: RoomPlanMove[]; draftAt: string } | null>(null)
  // Each change to the board counts up, so a save that answers after a newer change doesn't overwrite it.
  const revision = useRef(0)
  const [leaving, setLeaving] = useState<string | null>(null)
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getTrip(id, admin),
      api.getRooms(id, admin),
      api.getInterest(id, admin).catch(() => []),
    ])
      .then(async ([t, r, i]) => {
        setTrip(t)
        setRooms(r)
        setInterest(i)
        try {
          const plan = await api.getRoomPlan(id, admin)
          setLayoutState(plan.layout)
          setUpdatedAt(plan.updatedAt)
          setSharedAt(plan.sharedAt)
          setSharedNames(plan.sharedNames)
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) setLocked(true)
          else throw err
        }
      })
      .catch((err) => toAdminView(err) || setError('The room planner could not be loaded.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, admin])

  // Leaving with changes not saved asks first: closing the tab, and any link in the app (the way back, the account
  // menu).
  useEffect(() => {
    if (!dirty || admin) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      setLeaving(a.pathname + a.search + a.hash)
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', click, true)
    }
  }, [dirty, admin])

  const setLayout = useCallback((update: (l: RoomPlanLayout) => RoomPlanLayout) => {
    revision.current++
    setLayoutState((l) => (l ? update(l) : l))
    setDirty(true)
  }, [])

  /** When the draft was saved, or null when it didn't save (the reason shows at the top). */
  async function save(): Promise<string | null> {
    if (!layout) return null
    const sent = revision.current
    setBusy(true)
    setSaveError(null)
    setSaveFailed(false)
    try {
      const plan = await api.saveRoomPlan(id, layout)
      setUpdatedAt(plan.updatedAt)
      // A change made while saving stays on the board, still to be saved.
      if (revision.current === sent) {
        setLayoutState(plan.layout)
        setDirty(false)
      }
      return plan.updatedAt
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The draft did not save.')
      setSaveFailed(true)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft() {
    if (await save()) toast({ text: 'Draft saved. Nothing changed for guests.' })
  }

  async function openApply() {
    const draftAt = dirty || !updatedAt ? await save() : updatedAt
    if (!draftAt) return
    try {
      setMoves({ list: await api.getRoomPlanMoves(id), draftAt })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The moves could not be worked out.')
    }
  }

  async function apply(email: boolean, share: boolean): Promise<string | null> {
    if (!moves) return null
    try {
      const done = await api.applyRoomPlan(id, email, moves.draftAt, share)
      const [t, plan, r] = await Promise.all([
        api.getTrip(id),
        api.getRoomPlan(id),
        api.getRooms(id),
      ])
      setTrip(t)
      setRooms(r)
      revision.current++
      setLayoutState(plan.layout)
      setUpdatedAt(plan.updatedAt)
      setSharedAt(plan.sharedAt)
      setSharedNames(plan.sharedNames)
      setDirty(false)
      setMoves(null)
      window.dispatchEvent(new Event('cc:actions-changed'))
      const who = done.moved === 1 ? '1 guest' : `${done.moved} guests`
      const shareNote = plan.sharedAt
        ? ' The floor plan is on the trip page.'
        : sharedAt
          ? ' Guests no longer see the floor plan.'
          : ''
      toast({
        text:
          (!done.moved
            ? 'Rooms applied.'
            : done.emailed
              ? `Rooms applied: ${who} moved, and we emailed ${done.emailed === 1 ? 'them' : `all ${done.emailed}`}.`
              : `Rooms applied: ${who} moved.`) + shareNote,
      })
      if (done.needsLook.length)
        setSaveError(
          `Rooms applied, but the room price change for ${done.needsLook.join(', ')} wasn’t added to their balance. Trip Control asks about it.`
        )
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'The rooms were not applied.'
    }
  }

  /** Shares the plan as it is, from Apply when nobody moves. */
  async function share(): Promise<string | null> {
    if (!moves) return null
    try {
      const plan = await api.shareRoomPlan(id, moves.draftAt)
      setSharedAt(plan.sharedAt)
      setSharedNames(plan.sharedNames)
      setMoves(null)
      toast({ text: 'The floor plan is on the trip page.' })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'The floor plan was not shared.'
    }
  }

  async function openShare() {
    const draftAt = dirty || !updatedAt ? await save() : updatedAt
    if (draftAt) setSharing(draftAt)
  }

  /** Share on trip page: the plan as drawn, with names for accepted guests only when asked. */
  async function shareOnPage(names: boolean): Promise<string | null> {
    if (!sharing) return null
    try {
      const plan = await api.shareRoomPlan(id, sharing, names)
      setSharedAt(plan.sharedAt)
      setSharedNames(plan.sharedNames)
      setSharing(null)
      toast({
        text: names
          ? 'The floor plan is on the trip page. Accepted guests see who sleeps where.'
          : 'The floor plan is on the trip page, with no names.',
      })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'The floor plan was not shared.'
    }
  }

  async function stopSharing() {
    try {
      const plan = await api.unshareRoomPlan(id)
      setSharedAt(plan.sharedAt)
      toast({ text: 'Guests no longer see the floor plan.' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Sharing did not stop.')
    } finally {
      setStopping(false)
    }
  }

  async function addRoom(room: TripRoom): Promise<string | null> {
    try {
      const saved = await api.setRooms(id, [...rooms, room])
      setRooms(saved)
      toast({ text: `${room.name} added to the trip. It’s waiting under Rooms to place.` })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'The room was not added.'
    }
  }

  if (error) return <p className="p-8 text-body">{error}</p>
  if (!trip || (!layout && !locked))
    return <div className="min-h-screen bg-ground" aria-busy="true" />

  const people = tripPeople(trip.guests, interest)
  const back = (
    <Link
      to={admin ? `/admin/trips/${id}/control` : `/organize/${id}/control`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Trip Control: {trip.name}
    </Link>
  )

  if (locked || !layout)
    return (
      <div className="min-h-screen bg-ground pb-16 text-ink">
        <header className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-5 py-4">
          <Logo />
          <AccountMenu />
        </header>
        <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-5">
          {back}
          <h1 className="text-3xl font-extrabold">Room planner</h1>
          <PlannerLocked />
        </main>
      </div>
    )

  const plannerOnly = layout.spots.map((s) => spotPerson(s, people)).filter((p) => !p.guestId)
  // Rooms given more places on the plan, or more people than they sleep: applying makes them sleep that many.
  const grown = rooms.flatMap((r) => {
    const places = Math.max(
      planPlaces(
        r,
        layout.tiles.find((t) => t.roomId === r.id)
      ),
      layout.spots.filter((s) => s.roomId === r.id).length
    )
    return places > r.capacity ? [{ name: r.name, from: r.capacity, to: places }] : []
  })

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <HelpButton page="planner" tripId={id} />
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <span className={`${admin ? 'hidden' : 'hidden lg:flex'} items-center gap-3`}>
            <SaveState busy={busy} dirty={dirty} failed={saveFailed} updatedAt={updatedAt} />
            <button type="button" disabled={busy} onClick={saveDraft} className={outlined}>
              Save draft
            </button>
            <button type="button" disabled={busy} onClick={openShare} className={outlined}>
              Share on trip page
            </button>
            <button type="button" disabled={busy} onClick={openApply} className={filled}>
              Apply rooms
            </button>
          </span>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5">
        <div className="flex flex-col gap-1">
          {back}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold">Room planner</h1>
            <span className="rounded-full bg-royal-pale px-2.5 py-1 text-xs font-bold text-royal">
              Paid feature
            </span>
          </div>
          {admin && (
            <p className="mt-2 rounded-xl bg-royal-pale px-4 py-3 text-ink">
              You’re looking as an admin. Move people and rooms around to try ideas with the
              organizer; nothing you change here is saved or applied.
            </p>
          )}
          <p className={`text-body text-muted ${admin ? 'hidden' : ''}`}>
            {!updatedAt && 'This draft starts from the rooms guests have now. '}
            Nothing changes for guests until you apply rooms.
          </p>
        </div>
        {saveError && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {saveError}
          </p>
        )}
        {sharedAt && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-royal-pale px-4 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-royal">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="min-w-[200px] flex-1">
              <strong>The floor plan is on the trip page</strong>{' '}
              <span className="text-muted">
                {sharedNames
                  ? `as of ${sharedDay(sharedAt)}. Accepted guests see who sleeps where; everyone else sees the rooms with no names.`
                  : `as of ${sharedDay(sharedAt)}, with no names for anyone.`}
                {!admin &&
                  ' Keep drafting: guests see your changes only when you share or apply rooms again.'}
              </span>
            </p>
            {!admin && (
              <button type="button" onClick={() => setStopping(true)} className={outlined}>
                Stop sharing
              </button>
            )}
          </div>
        )}
        <div className="hidden lg:block">
          <PlannerBoard
            layout={layout}
            setLayout={setLayout}
            rooms={rooms}
            people={people}
            tripPriceCents={trip.costPerPersonCents}
            onAddRoom={admin ? undefined : () => setAdding(true)}
            fileName={`${trip.slug}-floor-plan`}
          />
        </div>
        <PhonePlan layout={layout} rooms={rooms} people={people} />
      </main>
      {moves && (
        <ApplyRoomsDialog
          moves={moves.list}
          grown={grown}
          plannerOnly={plannerOnly}
          shared={!!sharedAt}
          names={sharedNames}
          onApply={apply}
          onShare={share}
          onClose={() => setMoves(null)}
        />
      )}
      {sharing && (
        <ShareFloorPlanDialog
          shared={!!sharedAt}
          names={sharedNames}
          onShare={shareOnPage}
          onClose={() => setSharing(null)}
        />
      )}
      {leaving && (
        <ConfirmDialog
          title="Leave without saving?"
          confirmLabel="Leave without saving"
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            const to = leaving
            setDirty(false)
            setLeaving(null)
            navigate(to)
          }}
        >
          Your changes to the draft since you last saved will be lost. Stay to press Save draft.
        </ConfirmDialog>
      )}
      {stopping && (
        <ConfirmDialog
          title="Stop sharing the floor plan?"
          confirmLabel="Stop sharing"
          onCancel={() => setStopping(false)}
          onConfirm={stopSharing}
        >
          The floor plan leaves the trip page right away, for accepted guests and everyone else. You
          can share it again any time.
        </ConfirmDialog>
      )}
      {adding && (
        <AddRoomDialog
          needsPrice={trip.options.costSplit === 'room'}
          onAdd={addRoom}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

/** The trip doesn't have the planner: what it does, and where to get it. */
export function PlannerLocked() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2.5 text-lg font-bold">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-pale text-royal">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
        The room planner is a paid feature
      </h2>
      <p className="text-body">
        Lay out the house and drag people onto beds to work out who sleeps where, then apply it to
        the trip.
      </p>
      <Link to="/organize/features" className={`${outlined} self-start`}>
        See paid features
      </Link>
    </section>
  )
}

/** A phone shows the plan as a list: planning needs a computer's screen. */
function PhonePlan({
  layout,
  rooms,
  people,
}: {
  layout: RoomPlanLayout
  rooms: TripRoom[]
  people: Person[]
}) {
  const onPlan = layout.tiles.flatMap((t) => {
    const room = t.roomId ? rooms.find((r) => r.id === t.roomId) : undefined
    return room ? [room] : []
  })
  const waiting = notPlaced(layout, people)
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm">
        Open the room planner on a computer to move people around. Here’s the draft as it stands.
      </p>
      {onPlan.map((room) => {
        const spots = layout.spots.filter((s) => s.roomId === room.id)
        return (
          <section
            key={room.id}
            className="flex flex-col gap-2 rounded-2xl border border-rule bg-white p-4 shadow-card"
          >
            <h2 className="font-display text-lg font-bold">
              {room.name}{' '}
              <span className="text-sm font-normal text-muted">
                {spots.length} of{' '}
                {planPlaces(
                  room,
                  layout.tiles.find((t) => t.roomId === room.id)
                )}
              </span>
            </h2>
            <RoomArt beds={room.bedTypes} className="h-12 w-auto max-w-full self-start" />
            <div className="flex flex-wrap gap-1.5">
              {spots.length ? (
                spots.map((s) => <Chip key={s.index} person={spotPerson(s, people)} />)
              ) : (
                <span className="text-sm text-muted">Nobody here yet.</span>
              )}
            </div>
          </section>
        )
      })}
      {waiting.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-rule bg-white p-4 shadow-card">
          <h2 className="font-display text-lg font-bold">Not placed yet</h2>
          <div className="flex flex-wrap gap-1.5">
            {waiting.map((p) => (
              <Chip key={p.key} person={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** "+ Room": a real room on the trip, which then waits under Rooms to place. */
function AddRoomDialog({
  needsPrice,
  onAdd,
  onClose,
}: {
  needsPrice: boolean
  onAdd: (room: TripRoom) => Promise<string | null>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(2)
  const [bedTypes, setBedTypes] = useState<TripRoom['bedTypes']>([])
  const [price, setPrice] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const room: TripRoom = {
    name: name.trim(),
    beds: bedTypes.map((b) => BED_LABELS[b].label).join(', '),
    capacity,
    bedTypes,
    minPeople: 1,
    priceCents: needsPrice && price ? Math.round(Number(price) * 100) : null,
  }
  const problem = roomProblem(room, needsPrice)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (problem) return
    setBusy(true)
    const err = await onAdd(room)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog title="Add a room to the trip" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-sm text-muted">
          This adds the room to the trip, as in the trip editor’s Rooms step.
        </p>
        <Field label="Room">
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Sleeps">
          <input
            className={field}
            type="number"
            min={1}
            max={20}
            value={capacity}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </Field>
        {needsPrice && (
          <Field label="Price per person" as="div">
            <Money value={price} onChange={setPrice} label="Price per person" />
          </Field>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Beds</span>
          <RoomArt beds={bedTypes} className="h-14 w-auto max-w-full" />
          <span className="flex flex-wrap gap-1.5">
            {BED_TYPES.map((b) => (
              <button
                key={b}
                type="button"
                disabled={bedTypes.length >= 8}
                onClick={() => setBedTypes((bs) => [...bs, b])}
                className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale disabled:opacity-40"
              >
                + {BED_LABELS[b].label}
              </button>
            ))}
            {bedTypes.length > 0 && (
              <button
                type="button"
                onClick={() => setBedTypes((bs) => bs.slice(0, -1))}
                className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
              >
                Remove last bed
              </button>
            )}
          </span>
        </div>
        {tried && problem && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={outlined}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={filled}>
            Add room
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** Whether the trip has the room planner (null while asking). Admins looking at a trip don't ask. */
export function useHasPlanner(tripId: string, skip = false): boolean | null {
  const [has, setHas] = useState<boolean | null>(null)
  useEffect(() => {
    if (skip || !tripId) return
    api
      .getTripFeatures(tripId)
      .then((f) => setHas(f.includes('room_planner')))
      .catch(() => setHas(false))
  }, [tripId, skip])
  return has
}

/** The editor's Rooms step: the way into the planner, or what it is when the trip doesn't have it. */
export function PlannerEntry({ tripId }: { tripId: string }) {
  const has = useHasPlanner(tripId)
  if (has === null) return null
  if (!has) return <PlannerLocked />
  return (
    <Card title="Room planner">
      <p className="text-body">
        Lay out the house and drag people onto beds to work out who sleeps where. Nothing changes
        for guests until you apply rooms.
      </p>
      <Link to={`/organize/${tripId}/planner`} className={`${filled} self-start`}>
        Open the room planner
      </Link>
    </Card>
  )
}

/** Where the draft stands, beside Save draft: saved and when, changes waiting, saving, or not saved. */
function SaveState({
  busy,
  dirty,
  failed,
  updatedAt,
}: {
  busy: boolean
  dirty: boolean
  failed: boolean
  updatedAt: string | null
}) {
  const state: [typeof CloudCheck, string, string] | null = busy
    ? [LoaderCircle, 'Saving…', 'text-muted']
    : failed && dirty
      ? [CloudAlert, 'Not saved', 'text-[#B42318]']
      : dirty
        ? [CloudUpload, 'Unsaved changes', 'text-ink']
        : updatedAt
          ? [CloudCheck, `Saved ${savedAt(updatedAt)}`, 'text-royal']
          : null
  if (!state) return null
  const [Icon, text, tone] = state
  return (
    <span role="status" className={`flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
      <Icon className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      {text}
      {dirty && !busy && !failed && (
        <span className="h-2 w-2 rounded-full bg-marigold" aria-hidden="true" />
      )}
    </span>
  )
}
