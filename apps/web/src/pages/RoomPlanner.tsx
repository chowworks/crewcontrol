import {
  BED_LABELS,
  LANDMARK_KINDS,
  LANDMARK_LABELS,
  PLAN_CELL_PX,
  PLAN_MAX_SECTIONS,
  ROOM_MAX_PLACES,
  planPlaces,
  roomSpots,
  type LandmarkKind,
  type PlanSection,
  type PlanTile,
  type RoomPlanLayout,
  type RoomSpot,
  type TripRoom,
} from '@cc/types'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  Bath,
  DoorOpen,
  WavesLadder,
  Toilet,
  CookingPot,
  UtensilsCrossed,
  GripVertical,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Sofa,
  Trash2,
  TreePalm,
  Users,
  MoveHorizontal,
  RotateCw,
  X,
  Download,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { toPng } from 'html-to-image'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import {
  LandmarkTileFrame,
  PlanBands,
  PlanSectionFrame,
  RoomTileFrame,
  landmarkLabelClass,
  tileBox,
} from '@/components/PlanParts'
import { money } from '@/lib/format'
import {
  addTyped,
  lowerSection,
  moveSection,
  moveSectionAcross,
  notPlaced,
  place,
  removeSection,
  removeTile,
  removeTyped,
  renameTyped,
  resizeSection,
  setPlaces,
  sectionBands,
  setTile,
  spotPerson,
  uid,
  unplace,
  type From,
  type Person,
  type PersonKind,
} from '@/lib/roomPlan'

/**
 * The room planner's board (issue #93, option E): the side panel of people and rooms to place, and the house laid out
 * as named parts on dotted grids, with room tiles holding the beds' pictures and a place under each for a person.
 * Desktop only; a phone shows the plan as a list (RoomPlannerPage).
 */

const CELL = PLAN_CELL_PX
const ZOOMS = [0.5, 0.75, 1, 1.25]

export const KIND_CHIP: Record<PersonKind, string> = {
  accepted: 'border-2 border-royal bg-royal text-white',
  pending: 'border-2 border-royal bg-white text-royal',
  interested: 'border-2 border-dashed border-royal bg-white text-royal',
  typed: 'border-2 border-dotted border-muted bg-rule italic text-ink',
}

const KIND_LABEL: Record<PersonKind, string> = {
  accepted: 'Accepted guest',
  pending: 'Pending (signed, not accepted)',
  interested: 'Interested list',
  typed: 'Typed name, planner only',
}

const LANDMARK_ICON: Record<LandmarkKind, ReactNode> = {
  entry: <DoorOpen className="h-5 w-5" aria-hidden="true" />,
  bath: <Bath className="h-5 w-5" aria-hidden="true" />,
  halfbath: <Toilet className="h-5 w-5" aria-hidden="true" />,
  kitchen: <CookingPot className="h-5 w-5" aria-hidden="true" />,
  dining: <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />,
  living: <Sofa className="h-5 w-5" aria-hidden="true" />,
  stairs: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 20h4v-4h4v-4h4V8h4" />
    </svg>
  ),
  hall: <MoveHorizontal className="h-5 w-5" aria-hidden="true" />,
  outdoor: <TreePalm className="h-5 w-5" aria-hidden="true" />,
  pool: <WavesLadder className="h-5 w-5" aria-hidden="true" />,
  other: <MapPin className="h-5 w-5" aria-hidden="true" />,
}

/** A new room tile: wide enough for its beds' pictures, tall enough for a name under each. */
export const tileSize = (room: Pick<TripRoom, 'bedTypes'>) => ({
  // A bunk's places sit beside it, so it takes more width than a bed with its names under it.
  w: Math.min(
    43,
    Math.max(
      10,
      room.bedTypes.reduce((n, b) => n + (b === 'bunk' ? 8 : 5), 2)
    )
  ),
  h: 12,
})

type DragData =
  | { type: 'person'; person: Person; from: From }
  | { type: 'room'; roomId: string }
  | { type: 'section'; sectionId: string }

const btnOutline =
  'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-royal bg-white px-3 font-semibold text-royal hover:bg-royal-pale disabled:opacity-50'

/**
 * Each kind of drag sees only its own drop places: a room only the dots (where the pointer is, so a bed place under it
 * never takes the drop), a person only beds and the side panel, a part of the house only the below, beside and across zones.
 */
const ACCEPTS: Record<DragData['type'], string[]> = {
  room: ['grid'],
  person: ['spot', 'roomTile', 'panel'],
  section: ['zone', 'across'],
}
const collide: CollisionDetection = (args) => {
  const kind = (args.active.data.current as DragData | undefined)?.type
  if (!kind) return []
  const containers = args.droppableContainers.filter((c) =>
    ACCEPTS[kind].includes((c.data.current as { type?: string } | undefined)?.type ?? '')
  )
  const narrowed = { ...args, droppableContainers: containers }
  // A person lands where the pointer is; only when it's between places does the chip's overlap decide, so a drop
  // that the dragged chip only grazes still lands on the place under the pointer.
  if (kind !== 'person') return pointerWithin(narrowed)
  const under = pointerWithin(narrowed)
  // Over a place inside a room, the place wins over the room around it.
  const spot = under.find(
    (c) => (c.data?.droppableContainer.data.current as { type?: string })?.type === 'spot'
  )
  if (spot) return [spot]
  return under.length ? under : rectIntersection(narrowed)
}

export function PlannerBoard({
  layout,
  setLayout,
  rooms,
  people,
  tripPriceCents,
  onAddRoom,
  fileName = 'floor-plan',
}: {
  layout: RoomPlanLayout
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void
  rooms: TripRoom[]
  people: Person[]
  tripPriceCents: number
  /** Opens "+ Room": adds a room to the trip itself. */
  /** Left out for the admin, who can't change the trip. */
  onAddRoom?: () => void
  /** The downloaded picture's name, without .png. */
  fileName?: string
}) {
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // The landmark menu closes on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [menu])
  const [removing, setRemoving] = useState<PlanSection | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const plan = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // The whole plan at full size, whatever the zoom, without the handles for moving and resizing parts.
  async function downloadPicture() {
    if (!plan.current) return
    setExporting(true)
    setExportError(null)
    try {
      const url = await toPng(plan.current, {
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        style: { zoom: '1' },
        filter: (n) => !(n instanceof HTMLElement && 'noExport' in n.dataset),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName}.png`
      a.click()
      toast({ text: 'Downloaded the floor plan' })
    } catch {
      setExportError('The picture couldn’t be made. Try again, or take a screenshot instead.')
    } finally {
      setExporting(false)
    }
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  )

  const waiting = notPlaced(layout, people)
  const onPlan = new Set(layout.tiles.flatMap((t) => (t.roomId ? [t.roomId] : [])))
  const toPlace = rooms.filter((r) => r.id && !onPlan.has(r.id))
  const places = rooms
    .filter((r) => r.id && onPlan.has(r.id))
    .reduce(
      (n, r) =>
        n +
        planPlaces(
          r,
          layout.tiles.find((t) => t.roomId === r.id)
        ),
      0
    )
  const placed = layout.spots.filter((s) => onPlan.has(s.roomId)).length

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as DragData) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const data = e.active.data.current as DragData | undefined
    const over = e.over?.data.current as
      | { type: 'spot'; roomId: string; index: number }
      | { type: 'roomTile'; roomId: string }
      | { type: 'panel' }
      | { type: 'grid'; sectionId: string }
      | { type: 'zone'; sectionId: string; where: 'below' | 'beside' }
      | { type: 'across' }
      | undefined
    if (!data || !over) return
    if (data.type === 'person') {
      if (over.type === 'spot') {
        setLayout((l) =>
          place(l, data.person, data.from, { roomId: over.roomId, index: over.index })
        )
      } else if (over.type === 'roomTile') {
        // Dropped on a room but not on a place: the first free bed, one person per bed before anyone shares.
        const room = rooms.find((r) => r.id === over.roomId)
        if (!room) return
        setLayout((l) => {
          const free = roomSpots({
            ...room,
            capacity: planPlaces(
              room,
              l.tiles.find((t) => t.roomId === room.id)
            ),
          })
            .filter((p) => !l.spots.some((s) => s.roomId === room.id && s.index === p.index))
            .sort((a, b) => a.slot - b.slot || a.index - b.index)[0]
          return free
            ? place(l, data.person, data.from, { roomId: room.id!, index: free.index })
            : l
        })
      } else if (over.type === 'panel' && typeof data.from === 'object' && 'roomId' in data.from) {
        const from = data.from
        setLayout((l) => unplace(l, from.roomId, from.index))
      }
    } else if (data.type === 'room' && over.type === 'grid') {
      const room = rooms.find((r) => r.id === data.roomId)
      const dropped = e.active.rect.current.translated
      if (!room || !dropped || !e.over) return
      const x = Math.round((dropped.left - e.over.rect.left) / (CELL * zoom))
      const y = Math.round((dropped.top - e.over.rect.top) / (CELL * zoom))
      setLayout((l) =>
        setTile(l, {
          id: uid(),
          sectionId: over.sectionId,
          roomId: data.roomId,
          landmark: null,
          x,
          y,
          ...tileSize(room),
        })
      )
    } else if (data.type === 'section' && over.type === 'zone')
      setLayout((l) => moveSection(l, data.sectionId, over.sectionId, over.where))
    else if (data.type === 'section' && over.type === 'across')
      setLayout((l) => moveSectionAcross(l, data.sectionId, planWidth(l.sections) / CELL))
  }

  function addLandmark(kind: LandmarkKind) {
    setMenu(false)
    setLayout((l) => {
      const section = l.sections[0]
      const bottom = Math.max(
        0,
        ...l.tiles.filter((t) => t.sectionId === section.id).map((t) => t.y + t.h + 1)
      )
      return setTile(l, {
        id: uid(),
        sectionId: section.id,
        roomId: null,
        landmark: { kind, label: kind === 'other' ? 'Landmark' : LANDMARK_LABELS[kind] },
        x: 0,
        y: bottom,
        // A hallway starts long and narrow; the rest start square-ish.
        w: kind === 'hall' ? 14 : 6,
        h: kind === 'hall' ? 3 : 4,
      })
    })
  }

  function addSection() {
    setLayout((l) => ({
      ...l,
      sections: [
        ...l.sections,
        {
          id: uid(),
          name: l.sections.length === 1 ? 'Upstairs' : 'New part of the house',
          beside: false,
          cols: 43,
          rows: 14,
        },
      ],
    }))
  }

  function fit() {
    const width = planWidth(layout.sections) + 4
    const room = (scroller.current?.clientWidth ?? width) - 8
    setZoom(Math.max(0.4, Math.min(1, room / width)))
  }

  // The planner opens fitted to the screen (owner's decision, 2026-11-21). Hidden on a phone, the board has no width.
  useEffect(() => {
    if (scroller.current?.clientWidth) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderSection = (s: PlanSection) => (
    <Section
      section={s}
      layout={layout}
      setLayout={setLayout}
      rooms={rooms}
      people={people}
      tripPriceCents={tripPriceCents}
      zoom={zoom}
      draggingSection={dragging?.type === 'section' ? dragging.sectionId : null}
      onRemove={() =>
        layout.tiles.some((t) => t.sectionId === s.id)
          ? setRemoving(s)
          : setLayout((l) => removeSection(l, s.id))
      }
      canRemove={layout.sections.length > 1}
    />
  )

  const stepZoom = (dir: 1 | -1) =>
    setZoom((z) => {
      const i = ZOOMS.findIndex((x) => x >= z - 0.001)
      const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))]
      return next
    })

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      // The plan scrolls only when the pointer is right at its edge: by default a fifth of its width scrolls it, so a
      // room near the edge slid away under the pointer and the drop missed it.
      autoScroll={{ threshold: { x: 0.04, y: 0.06 }, acceleration: 6 }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-0 gap-6">
        <SidePanel
          setLayout={setLayout}
          waiting={waiting}
          people={people}
          toPlace={toPlace}
          placed={placed}
          places={places}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {onAddRoom && (
              <button type="button" onClick={onAddRoom} className={btnOutline}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Room
              </button>
            )}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
                className={btnOutline}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Bathroom, Stairs, or other landmarks
              </button>
              {menu && (
                <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-rule bg-white shadow-[0_8px_24px_rgba(15,28,46,0.12)]">
                  {LANDMARK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => addLandmark(k)}
                      className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left hover:bg-royal-pale"
                    >
                      {LANDMARK_ICON[k]}
                      {LANDMARK_LABELS[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => stepZoom(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white hover:bg-ground"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-14 text-center text-sm font-semibold">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => stepZoom(1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white hover:bg-ground"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={fit} className={`${btnOutline} ml-1`}>
                Fit to screen
              </button>
              <button
                type="button"
                onClick={downloadPicture}
                disabled={exporting}
                className={`${btnOutline} inline-flex items-center gap-1.5`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {exporting ? 'Downloading…' : 'Download picture'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-rule bg-white p-4 shadow-card">
            {exportError && (
              <p role="alert" className="font-semibold text-[#B42318]">
                {exportError}
              </p>
            )}
            <div ref={scroller} className="overflow-x-auto pb-2">
              <div
                ref={plan}
                style={{ zoom }}
                className="flex w-max flex-col items-start gap-4 bg-white pt-3"
              >
                <PlanBands sections={layout.sections} renderSection={renderSection} />
                {dragging?.type === 'section' && <AcrossZone />}
              </div>
            </div>
            <button
              type="button"
              disabled={layout.sections.length >= PLAN_MAX_SECTIONS}
              onClick={addSection}
              className="min-h-[44px] rounded-xl border-2 border-dashed border-royal bg-white font-semibold text-royal hover:bg-royal-pale disabled:opacity-50"
            >
              + Add a floor or part of the house
            </button>
            <p className="text-sm text-muted">
              Drag a room by its name to move it, even to another part of the house, and its corner
              to resize it. Everything snaps to the dots. Drag a part of the house by its dots to
              put it below or beside another, or across the bottom, and by its right or bottom edge
              to resize it.
            </p>
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging?.type === 'person' && <Chip person={dragging.person} lifted />}
        {dragging?.type === 'room' && (
          <div className="rounded-xl border-2 border-royal bg-white px-3 py-2 font-display font-bold shadow-[0_8px_20px_rgba(15,28,46,0.25)]">
            {rooms.find((r) => r.id === dragging.roomId)?.name}
          </div>
        )}
        {dragging?.type === 'section' && (
          <div className="w-max whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,28,46,0.25)]">
            {layout.sections.find((s) => s.id === dragging.sectionId)?.name}
          </div>
        )}
      </DragOverlay>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setLayout((l) => removeSection(l, removing.id))
            setRemoving(null)
          }}
        >
          Its rooms go back to Rooms to place, and the people in them back to Not placed yet. Its
          bathrooms and landmarks are removed.
        </ConfirmDialog>
      )}
    </DndContext>
  )
}

function SidePanel({
  setLayout,
  waiting,
  people,
  toPlace,
  placed,
  places,
}: {
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void
  waiting: Person[]
  people: Person[]
  toPlace: TripRoom[]
  placed: number
  places: number
}) {
  const [name, setName] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: 'panel', data: { type: 'panel' } })
  const typed = name.trim()
  const match =
    typed.length >= 2
      ? people.find((p) => p.name.toLowerCase().startsWith(typed.toLowerCase()))
      : undefined
  const total = waiting.length + placed

  function add() {
    if (!typed) return
    setLayout((l) => addTyped(l, typed.slice(0, 60)))
    setName('')
  }

  return (
    <aside
      ref={setNodeRef}
      className={`flex w-[290px] shrink-0 flex-col gap-4 self-start rounded-2xl border bg-white p-5 shadow-card ${isOver ? 'border-royal' : 'border-rule'}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-pale">
          <Users className="h-[18px] w-[18px] text-royal" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-extrabold">People</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label htmlFor="plan-add-name" className="mb-1.5 block text-sm font-semibold">
          Add someone who hasn’t signed up
        </label>
        <div className="flex gap-2">
          <input
            id="plan-add-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Like Kendra’s +1"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line px-3"
          />
          <button
            type="submit"
            disabled={!typed}
            className="min-h-[44px] rounded-xl border-2 border-royal px-3 font-semibold text-royal hover:bg-royal-pale disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {match && (
          <p className="mt-1.5 text-sm text-muted">
            {match.name} is on the trip already: drag them from the list below.
          </p>
        )}
      </form>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">Not placed yet ({waiting.length})</h3>
        {waiting.length ? (
          <div className="flex flex-wrap gap-2">
            {waiting.map((p) => (
              <PanelChip
                key={p.key}
                person={p}
                onRemove={
                  p.key.startsWith('w:')
                    ? () => setLayout((l) => removeTyped(l, Number(p.key.slice(2))))
                    : undefined
                }
                onRename={
                  p.key.startsWith('w:')
                    ? (name) =>
                        setLayout((l) => renameTyped(l, { waiting: Number(p.key.slice(2)) }, name))
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Everyone’s on a bed.</p>
        )}
      </div>
      <p className="text-sm text-muted">
        Placed: {placed} of {total} {total === 1 ? 'name' : 'names'}. Beds left:{' '}
        {Math.max(0, places - placed)}.
      </p>
      {toPlace.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">
            Rooms to place ({toPlace.length})
          </h3>
          <div className="flex flex-col gap-2">
            {toPlace.map((r) => (
              <RoomToPlace key={r.id} room={r} />
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">Drag a room onto the plan.</p>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-rule pt-3.5">
        <h3 className="text-sm font-semibold">Who’s who</h3>
        {(Object.keys(KIND_LABEL) as PersonKind[]).map((k) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold ${KIND_CHIP[k]}`}
            >
              Name
            </span>
            {KIND_LABEL[k]}
          </div>
        ))}
      </div>
    </aside>
  )
}

function RoomToPlace({ room }: { room: TripRoom }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `room:${room.id}`,
    data: { type: 'room', roomId: room.id ?? '' } satisfies DragData,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className={`flex min-h-[44px] cursor-grab flex-col items-start rounded-xl border-2 border-royal bg-white px-3 py-1.5 text-left ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="font-display font-bold">{room.name}</span>
      <span className="text-xs text-muted">
        {room.bedTypes.length
          ? room.bedTypes.map((b) => BED_LABELS[b].label).join(', ')
          : `Sleeps ${room.capacity}`}
      </span>
    </button>
  )
}

export function Chip({ person, lifted = false }: { person: Person; lifted?: boolean }) {
  return (
    // A long name is cut off; hovering shows it whole.
    <span
      title={person.name}
      className={`inline-flex h-7 max-w-[120px] items-center truncate whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${KIND_CHIP[person.kind]} ${lifted ? '-rotate-3 shadow-[0_8px_20px_rgba(15,28,46,0.25)]' : ''}`}
    >
      <span className="truncate">{person.name}</span>
    </span>
  )
}

function PanelChip({
  person,
  onRemove,
  onRename,
}: {
  person: Person
  onRemove?: () => void
  onRename?: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const from: From = person.key.startsWith('w:')
    ? { waiting: Number(person.key.slice(2)) }
    : 'panel'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `p:${person.key}`,
    data: { type: 'person', person, from } satisfies DragData,
    disabled: editing,
  })
  return (
    <span className={`inline-flex items-center gap-0.5 ${isDragging ? 'opacity-40' : ''}`}>
      {editing && onRename ? (
        <NameInput name={person.name} onDone={(n) => (n && onRename(n), setEditing(false))} />
      ) : (
        <button
          ref={setNodeRef}
          type="button"
          aria-label={
            onRename
              ? `Drag ${person.name} onto a bed, or click to edit the name`
              : `Drag ${person.name} onto a bed`
          }
          {...attributes}
          {...listeners}
          onClick={onRename ? () => setEditing(true) : undefined}
          className="cursor-grab"
        >
          <Chip person={person} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${person.name}`}
          className="rounded-full p-1 text-muted hover:bg-ground hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

function Section({
  section,
  layout,
  setLayout,
  rooms,
  people,
  tripPriceCents,
  zoom,
  draggingSection,
  onRemove,
  canRemove,
}: {
  section: PlanSection
  layout: RoomPlanLayout
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void
  rooms: TripRoom[]
  people: Person[]
  tripPriceCents: number
  zoom: number
  draggingSection: string | null
  onRemove: () => void
  canRemove: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(section.name)
  const grid = useDroppable({
    id: `grid:${section.id}`,
    data: { type: 'grid', sectionId: section.id },
  })
  const handle = useDraggable({
    id: `section:${section.id}`,
    data: { type: 'section', sectionId: section.id } satisfies DragData,
  })
  const tiles = layout.tiles.filter((t) => t.sectionId === section.id)
  // Dragging the right or bottom edge makes the part of the house wider or narrower, taller or shorter, by whole dots.
  // Dragging its top edge lowers or raises the whole part, so a wing can sit level with the middle of its neighbour.
  const edge = useRef<{
    x: number
    y: number
    cols: number
    rows: number
    down: number
    d: number
  } | null>(null)
  const edgeDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    edge.current = {
      x: e.clientX,
      y: e.clientY,
      cols: section.cols,
      rows: section.rows,
      down: section.down ?? 0,
      d: 0,
    }
  }
  const edgeMove = (axis: 'x' | 'y' | 'top') => (e: ReactPointerEvent) => {
    const s = edge.current
    if (!s) return
    const d = Math.round((axis === 'x' ? e.clientX - s.x : e.clientY - s.y) / (CELL * zoom))
    if (d === s.d) return
    s.d = d
    if (axis === 'top') {
      // Moving the part, not the pointer's offset: once the edge moves, the pointer's start moves with it.
      setLayout((l) => lowerSection(l, section.id, s.down + d))
      return
    }
    setLayout((l) =>
      resizeSection(
        l,
        section.id,
        axis === 'x' ? s.cols + d : s.cols,
        axis === 'y' ? s.rows + d : s.rows
      )
    )
  }
  const edgeUp = () => {
    edge.current = null
  }
  const edgeHandle = (axis: 'x' | 'y' | 'top') => (
    <div
      data-no-export
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={
        axis === 'top'
          ? `Drag to move ${section.name} up or down`
          : `Drag to make ${section.name} ${axis === 'x' ? 'wider or narrower' : 'taller or shorter'}`
      }
      title={axis === 'top' ? 'Drag to move this part up or down' : undefined}
      onPointerDown={edgeDown}
      onPointerMove={edgeMove(axis)}
      onPointerUp={edgeUp}
      onPointerCancel={edgeUp}
      onLostPointerCapture={edgeUp}
      className={`group absolute z-10 flex touch-none items-center justify-center ${
        axis === 'x'
          ? '-right-2 top-0 h-full w-4 cursor-ew-resize'
          : axis === 'top'
            ? '-top-3.5 left-0 h-3 w-full cursor-row-resize'
            : '-bottom-2 left-0 h-4 w-full cursor-ns-resize'
      }`}
    >
      <span
        className={`rounded-full bg-line group-hover:bg-royal ${axis === 'x' ? 'h-10 w-1' : 'h-1 w-10'}`}
      />
    </div>
  )

  function rename() {
    const n = name.trim().slice(0, 60)
    if (n)
      setLayout((l) => ({
        ...l,
        sections: l.sections.map((s) => (s.id === section.id ? { ...s, name: n } : s)),
      }))
    else setName(section.name)
    setRenaming(false)
  }

  return (
    <PlanSectionFrame
      section={section}
      top={edgeHandle('top')}
      name={
        <>
          <button
            ref={handle.setNodeRef}
            type="button"
            data-no-export
            aria-label={`Move ${section.name}`}
            {...handle.attributes}
            {...handle.listeners}
            className="cursor-grab rounded-md p-1 text-muted hover:bg-ground"
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
          {renaming ? (
            <input
              aria-label="Name of this part of the house"
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename()
                if (e.key === 'Escape') {
                  setName(section.name)
                  setRenaming(false)
                }
              }}
              className="h-9 w-56 rounded-lg border-2 border-royal px-2.5 text-sm font-semibold"
            />
          ) : (
            <>
              <span className="text-sm font-semibold text-muted">{section.name}</span>
              <button
                type="button"
                data-no-export
                aria-label={`Rename ${section.name}`}
                onClick={() => {
                  setName(section.name)
                  setRenaming(true)
                }}
                className="rounded-md p-2 text-royal hover:bg-royal-pale"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </>
      }
      end={
        canRemove && (
          <button
            type="button"
            data-no-export
            aria-label={`Remove ${section.name}`}
            onClick={onRemove}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white hover:bg-ground"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      }
      gridRef={grid.setNodeRef}
      gridId={section.id}
      gridClassName={grid.isOver ? 'ring-2 ring-royal' : ''}
      after={
        draggingSection &&
        draggingSection !== section.id && (
          <>
            <Zone id={section.id} where="beside" />
            <Zone id={section.id} where="below" />
          </>
        )
      }
    >
      {tiles.map((t) => (
        <Tile
          key={t.id}
          tile={t}
          layout={layout}
          setLayout={setLayout}
          room={rooms.find((r) => r.id === t.roomId)}
          people={people}
          tripPriceCents={tripPriceCents}
          zoom={zoom}
        />
      ))}
      {edgeHandle('x')}
      {edgeHandle('y')}
    </PlanSectionFrame>
  )
}

/** The plan's width in pixels at 100%: its widest row of columns, or part stretched across it. */
function planWidth(sections: PlanSection[]): number {
  return Math.max(
    ...sectionBands(sections).map((band) =>
      'across' in band
        ? band.across.cols * CELL
        : band.columns.reduce((w, col) => w + Math.max(...col.map((s) => s.cols)) * CELL, 0) +
          // Two gaps and the line between each pair of columns.
          (band.columns.length - 1) * 41
    )
  )
}

/** Below the whole plan while a part of the house is dragged: drop it here to stretch it across the bottom. */
function AcrossZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'across', data: { type: 'across' } })
  return (
    <div
      ref={setNodeRef}
      className={`flex h-14 w-full items-center justify-center rounded-xl border-2 border-dashed text-sm font-semibold ${
        isOver ? 'border-royal bg-royal-pale text-royal' : 'border-line bg-white/80 text-muted'
      }`}
    >
      Put across the bottom
    </div>
  )
}

/** Placed by offsets, never a CSS transform: the drop finds boxes by where they sit without one. */
function Zone({ id, where }: { id: string; where: 'below' | 'beside' }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${where}:${id}`,
    data: { type: 'zone', sectionId: id, where },
  })
  return (
    <div
      ref={setNodeRef}
      className={`absolute z-10 flex items-center justify-center rounded-xl border-2 border-dashed text-sm font-semibold ${
        isOver ? 'border-royal bg-royal-pale text-royal' : 'border-line bg-white/80 text-muted'
      } ${where === 'beside' ? 'left-full top-0 ml-3 h-full w-24' : 'left-0 top-full mt-3 h-14 w-full'}`}
    >
      {where === 'beside' ? 'Put beside' : 'Put below'}
    </div>
  )
}

/**
 * Dragging a tile by its name moves it; by its corner, resizes it. Both snap to the dots. A move shows as it goes and
 * lands on the drop: over another part of the house, the room moves there, where the pointer let go.
 */
function useTileDrag(
  tile: PlanTile,
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void,
  zoom: number
) {
  const start = useRef<{
    x: number
    y: number
    dx: number
    dy: number
    tile: PlanTile
    mode: 'move' | 'resize'
    grid: DOMRect | null
  } | null>(null)
  const [shift, setShift] = useState<{ dx: number; dy: number } | null>(null)
  const down = (mode: 'move' | 'resize') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const grid = el.closest('[data-grid]')?.getBoundingClientRect() ?? null
    start.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, tile, mode, grid }
  }
  const move = (e: ReactPointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = Math.round((e.clientX - s.x) / (CELL * zoom))
    const dy = Math.round((e.clientY - s.y) / (CELL * zoom))
    // Only a move of a whole dot changes the plan, so a click on a name doesn't count as a change.
    if (dx === s.dx && dy === s.dy) return
    s.dx = dx
    s.dy = dy
    if (s.mode === 'move') setShift({ dx, dy })
    else setLayout((l) => setTile(l, { ...s.tile, w: s.tile.w + dx, h: s.tile.h + dy }))
  }
  const up = (e: ReactPointerEvent) => {
    const s = start.current
    start.current = null
    if (!s || s.mode !== 'move') return
    setShift(null)
    if (s.dx === 0 && s.dy === 0) return
    const other = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest<HTMLElement>('[data-grid]'))
      .find((g) => g && g.dataset.grid !== s.tile.sectionId)
    if (other?.dataset.grid && s.grid) {
      const cell = CELL * zoom
      const r = other.getBoundingClientRect()
      // Where on the room the pointer held it, so the room lands under the pointer as it was carried.
      const grabX = (s.x - s.grid.left) / cell - s.tile.x
      const grabY = (s.y - s.grid.top) / cell - s.tile.y
      const to = other.dataset.grid
      setLayout((l) =>
        setTile(l, {
          ...s.tile,
          sectionId: to,
          x: Math.round((e.clientX - r.left) / cell - grabX),
          y: Math.round((e.clientY - r.top) / cell - grabY),
        })
      )
    } else setLayout((l) => setTile(l, { ...s.tile, x: s.tile.x + s.dx, y: s.tile.y + s.dy }))
  }
  const cancel = () => {
    start.current = null
    setShift(null)
  }
  return { down, move, up, cancel, shift }
}

function Tile({
  tile,
  layout,
  setLayout,
  room,
  people,
  tripPriceCents,
  zoom,
}: {
  tile: PlanTile
  layout: RoomPlanLayout
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void
  room: TripRoom | undefined
  people: Person[]
  tripPriceCents: number
  zoom: number
}) {
  const drag = useTileDrag(tile, setLayout, zoom)
  const drop = useDroppable({
    id: `room:${tile.id}`,
    data: { type: 'roomTile', roomId: tile.roomId },
    disabled: !tile.roomId,
  })
  const [renaming, setRenaming] = useState(false)
  const style = {
    ...tileBox({
      ...tile,
      x: tile.x + (drag.shift?.dx ?? 0),
      y: tile.y + (drag.shift?.dy ?? 0),
    }),
    // Carried over the other parts of the house, the room stays on top.
    ...(drag.shift ? { zIndex: 30 } : {}),
  }
  const remove = () => setLayout((l) => removeTile(l, tile.id))
  const grip = (
    <span
      data-no-export
      onPointerDown={drag.down('resize')}
      onPointerMove={drag.move}
      onPointerUp={drag.up}
      onPointerCancel={drag.cancel}
      onLostPointerCapture={drag.cancel}
      aria-hidden="true"
      className="absolute bottom-1 right-1 h-3 w-3 cursor-nwse-resize rounded-br border-b-[3px] border-r-[3px] border-royal"
    />
  )

  if (tile.landmark) {
    const lm = tile.landmark
    // A quarter turn swaps the tile's width and height, so turned stairs run the other way across the dots.
    const turn = () =>
      setLayout((l) =>
        setTile(l, {
          ...tile,
          w: tile.h,
          h: tile.w,
          landmark: { ...lm, turn: ((lm.turn ?? 0) + 1) % 4 || undefined },
        })
      )
    return (
      <LandmarkTileFrame
        style={style}
        kind={lm.kind}
        turn={lm.turn}
        className="group"
        label={
          renaming ? (
            <input
              aria-label="Landmark name"
              autoFocus
              defaultValue={lm.label}
              maxLength={60}
              onBlur={(e) => {
                const label = e.target.value.trim()
                if (label) setLayout((l) => setTile(l, { ...tile, landmark: { ...lm, label } }))
                setRenaming(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="relative w-full rounded border border-royal px-1 text-center text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className={`${landmarkLabelClass} hover:underline`}
              title="Rename"
            >
              {lm.label}
            </button>
          )
        }
        under={
          <div
            onPointerDown={drag.down('move')}
            onPointerMove={drag.move}
            onPointerUp={drag.up}
            onPointerCancel={drag.cancel}
            onLostPointerCapture={drag.cancel}
            className="absolute inset-0 cursor-move rounded-xl"
            aria-hidden="true"
          />
        }
      >
        <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={turn}
            aria-label={`Turn ${lm.label}`}
            title="Turn a quarter"
            className="rounded-full bg-white/80 p-1 text-muted hover:bg-white hover:text-royal"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${lm.label}`}
            className="rounded-full bg-white/80 p-1 text-muted hover:bg-white hover:text-royal"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
        {grip}
      </LandmarkTileFrame>
    )
  }

  if (!room) return null
  const added = planPlaces(room, tile)
  const inRoom = layout.spots.filter((s) => s.roomId === room.id)
  // What the room sleeps on the plan: places added with +, or everyone on it, as Apply counts it.
  const places = Math.max(added, inRoom.length)
  const spots = roomSpots({ ...room, capacity: added })
  const full = inRoom.length >= places
  // A place added with + goes back unless that would leave someone without one.
  const canTakeBack = added > room.capacity && setPlaces(layout, room, added - 1) !== layout
  const price = room.priceCents ?? tripPriceCents
  return (
    <RoomTileFrame
      tileRef={drop.setNodeRef}
      className={drop.isOver ? 'border-royal' : 'border-line'}
      style={style}
      bedTypes={room.bedTypes}
      spots={spots}
      renderSpot={(s) => (
        <Spot
          key={s.index}
          room={room}
          spot={s}
          layout={layout}
          setLayout={setLayout}
          people={people}
          full={full}
        />
      )}
      head={
        <div
          onPointerDown={drag.down('move')}
          onPointerMove={drag.move}
          onPointerUp={drag.up}
          onPointerCancel={drag.cancel}
          onLostPointerCapture={drag.cancel}
          className="-mx-3 -mt-2.5 cursor-move select-none px-3 pt-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <strong className="truncate font-display text-[15px]">{room.name}</strong>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={remove}
              aria-label={`Take ${room.name} off the plan`}
              className="hidden rounded-full p-1 text-muted hover:bg-ground group-focus-within:block group-hover:block"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span className="flex-1">
              {money(price)} each · Sleeps {places}
              {places > room.capacity && ` (was ${room.capacity})`}
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setLayout((l) => setPlaces(l, room, added - 1))}
              disabled={!canTakeBack}
              aria-label={`Take a place back from ${room.name}`}
              title="Take back a place you added"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white text-ink opacity-0 hover:bg-ground focus-visible:opacity-100 disabled:cursor-not-allowed disabled:border-rule disabled:text-line group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setLayout((l) => setPlaces(l, room, places + 1))}
              disabled={places >= ROOM_MAX_PLACES}
              aria-label={`Add a place to ${room.name}`}
              title="Add a place: applying rooms makes the room sleep one more"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-royal bg-white text-royal opacity-0 hover:bg-royal-pale focus-visible:opacity-100 disabled:cursor-not-allowed disabled:border-rule disabled:text-line group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      }
    >
      {grip}
    </RoomTileFrame>
  )
}

function Spot({
  room,
  spot,
  layout,
  setLayout,
  people,
  full,
}: {
  room: TripRoom
  spot: RoomSpot
  layout: RoomPlanLayout
  setLayout: (update: (l: RoomPlanLayout) => RoomPlanLayout) => void
  people: Person[]
  /** The room has as many people as it sleeps: someone more on a free bed makes it sleep one more. */
  full: boolean
}) {
  const roomId = room.id!
  const { setNodeRef, isOver } = useDroppable({
    id: `spot:${roomId}:${spot.index}`,
    data: { type: 'spot', roomId, index: spot.index },
  })
  const taken = layout.spots.find((s) => s.roomId === roomId && s.index === spot.index)
  return (
    <div ref={setNodeRef}>
      {taken ? (
        <PlacedChip
          person={spotPerson(taken, people)}
          from={{ roomId, index: spot.index }}
          hot={isOver}
          onRename={(name) => setLayout((l) => renameTyped(l, { roomId, index: spot.index }, name))}
        />
      ) : (
        <span
          title={full ? 'Putting someone here makes the room sleep one more' : undefined}
          className={`inline-flex h-7 items-center rounded-full border-2 px-2.5 text-[11px] font-medium ${
            isOver
              ? 'border-solid border-royal bg-royal-pale text-royal'
              : full
                ? 'border-dashed border-line/60 bg-transparent text-muted/70'
                : 'border-dashed border-line bg-white text-muted'
          }`}
        >
          {isOver ? 'Drop here' : full ? 'Spare' : 'Empty'}
        </span>
      )}
    </div>
  )
}

function PlacedChip({
  person,
  from,
  hot,
  onRename,
}: {
  person: Person
  from: From
  hot: boolean
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed:${typeof from === 'object' && 'roomId' in from ? `${from.roomId}:${from.index}` : person.key}`,
    data: { type: 'person', person, from } satisfies DragData,
    disabled: editing,
  })
  if (editing)
    return <NameInput name={person.name} onDone={(n) => (n && onRename(n), setEditing(false))} />
  const typed = person.kind === 'typed'
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={typed ? `Move ${person.name}, or click to edit the name` : `Move ${person.name}`}
      {...attributes}
      {...listeners}
      onClick={typed ? () => setEditing(true) : undefined}
      className={`cursor-grab rounded-full ${hot ? 'ring-2 ring-royal ring-offset-1' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <Chip person={person} />
    </button>
  )
}

/** A typed name being corrected, in place of its chip: Enter or a click away keeps it, Escape leaves it as it was. */
function NameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  return (
    <input
      aria-label="Name"
      autoFocus
      defaultValue={name}
      maxLength={60}
      onFocus={(e) => e.target.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = name
          e.currentTarget.blur()
        }
      }}
      className="h-7 w-[120px] rounded-full border-2 border-royal bg-white px-2.5 text-xs font-semibold text-ink outline-none"
    />
  )
}
