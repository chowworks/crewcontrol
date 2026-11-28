import {
  BED_LABELS,
  PLAN_CELL_PX,
  type PlanSection,
  type SharedPlanTile,
  type SharedRoomPlan,
} from '@cc/types'
import { Minus, Plus, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { BedPicture, LANDMARK_FLOOR, LandmarkPicture } from '@/components/RoomArt'
import { sectionBands } from '@/lib/roomPlan'

const CELL = PLAN_CELL_PX
// Two gaps and the line between each pair of columns, as on the room planner.
const COLUMN_GAP = 41

type Place = NonNullable<SharedPlanTile['room']>['places'][number]

const chipBase = 'inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold'
// The public trip page's plan (owner's decision, 2026-11-28): every place the same, a placeholder with no name.
const placeholder = `${chipBase} border-2 border-dashed border-line text-muted`
function Chip({ p, anonymous }: { p: Place; anonymous: boolean }) {
  if (anonymous)
    return (
      <span className={placeholder} role="img" aria-label="A place to sleep">
        <User className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    )
  return <span className={chipClass(p)}>{chipText(p)}</span>
}
function chipClass(p: Place) {
  if (p.name)
    return `${chipBase} bg-royal text-white ${p.you ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#F2B33D]' : ''}`
  if (p.taken) return `${chipBase} border-2 border-dotted border-muted bg-ground text-muted`
  return `${chipBase} border-2 border-dashed border-line font-medium text-muted`
}
const chipText = (p: Place) =>
  p.name ? (p.you ? `${p.name} (you)` : p.name) : p.taken ? 'Taken' : 'Free'

// "King", "2 Twins": each kind of bed once, with how many.
const bedsLine = (room: NonNullable<SharedPlanTile['room']>) => {
  if (!room.bedTypes.length) return 'Places to sleep'
  const kinds = [...new Set(room.bedTypes)]
  return kinds
    .map((b) => {
      const n = room.bedTypes.filter((t) => t === b).length
      return n > 1 ? `${n} ${BED_LABELS[b].label}s` : BED_LABELS[b].label
    })
    .join(', ')
}

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * The floor plan an organizer shared, as last applied, with no prices. Accepted guests see who sleeps where (accepted
 * guests by name, anyone else "Taken"); everyone else (`anonymous`, under Rooms on the trip page) sees only the rooms
 * and their beds, every place the same (owner's decision, 2026-11-28). A phone gets a list by part of the house; a
 * computer gets the plan.
 */
export function GuestFloorPlan({
  plan,
  anonymous = false,
}: {
  plan: SharedRoomPlan
  anonymous?: boolean
}) {
  const [open, setOpen] = useState(false)
  const mine = plan.tiles.find((t) => t.room?.places.some((p) => p.you))
  const myPlace = mine?.room?.places.find((p) => p.you)
  const myBed = myPlace?.bed != null ? mine?.room?.bedTypes[myPlace.bed] : undefined
  const sections = plan.sections.filter((s) =>
    plan.tiles.some((t) => t.sectionId === s.id && t.room)
  )

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {anonymous ? (
          <h3 className="text-lg font-extrabold">Floor plan</h3>
        ) : (
          <h2 className="text-[26px] font-extrabold">Where everyone sleeps</h2>
        )}
        <span className="text-sm text-muted">Updated {shortDay(plan.sharedAt)}</span>
      </div>
      <div className="flex flex-col gap-3.5 rounded-[14px] bg-white p-4">
        {mine?.room && (
          <p className="rounded-xl bg-royal-pale px-4 py-3">
            <strong>You’re in the {mine.room.name}</strong>
            {myBed ? `, on the ${BED_LABELS[myBed].label} bed.` : '.'}
            <span className="hidden lg:inline"> Your spot has a gold ring.</span>
          </p>
        )}

        {/* A phone: the rooms as a list, by part of the house. */}
        <div className="flex flex-col gap-3 lg:hidden">
          {sections.map((s) => (
            <div key={s.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                <span>{s.name}</span>
                <span className="h-px flex-1 bg-rule" />
              </div>
              {plan.tiles
                .filter((t) => t.sectionId === s.id && t.room)
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1.5 rounded-xl border border-rule px-3 py-2.5"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <strong className="text-[15px]">{t.room!.name}</strong>
                      <span className="text-xs text-muted">{bedsLine(t.room!)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.room!.places.map((p) => (
                        <Chip key={p.index} p={p} anonymous={anonymous} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* A computer: the plan the organizer drew, shrunk to fit. */}
        <div className="hidden lg:block">
          <FittedPlan plan={plan} anonymous={anonymous} />
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center self-stretch rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale lg:self-start"
        >
          <span className="lg:hidden">See the floor plan</span>
          <span className="hidden lg:inline">Zoom in</span>
        </button>
        <p className="text-sm text-muted">
          {anonymous
            ? 'The rooms and beds your organizer planned.'
            : 'The plan your organizer drew, as they last applied rooms.'}
        </p>
      </div>
      {open && (
        <Dialog
          title={anonymous ? 'Floor plan' : 'Where everyone sleeps'}
          wide
          onClose={() => setOpen(false)}
        >
          <FittedPlan plan={plan} zoomable anonymous={anonymous} />
        </Dialog>
      )}
    </section>
  )
}

function planWidth(sections: PlanSection[]): number {
  return Math.max(
    0,
    ...sectionBands(sections).map((band) =>
      'across' in band
        ? band.across.cols * CELL
        : band.columns.reduce((w, col) => w + Math.max(...col.map((s) => s.cols)) * CELL, 0) +
          (band.columns.length - 1) * COLUMN_GAP
    )
  )
}

const ZOOMS = [0.5, 0.75, 1]

/**
 * The plan at a zoom that fits its box, never larger than full size. Zoomable, it starts there and steps in and out,
 * scrolling once it's wider than the box.
 */
function FittedPlan({
  plan,
  zoomable = false,
  anonymous = false,
}: {
  plan: SharedRoomPlan
  zoomable?: boolean
  anonymous?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [fitted, setFitted] = useState(1)
  const [chosen, setChosen] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setFitted(Math.min(1, el.clientWidth / Math.max(1, planWidth(plan.sections))))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [plan.sections])
  const zoom = chosen ?? fitted
  const step = (d: 1 | -1) => {
    const next =
      d > 0 ? ZOOMS.find((z) => z > zoom + 0.01) : [...ZOOMS].reverse().find((z) => z < zoom - 0.01)
    setChosen(next ?? (d > 0 ? 1 : Math.min(fitted, zoom)))
  }
  const btn =
    'flex h-11 w-11 items-center justify-center rounded-xl border-2 border-royal bg-white text-royal hover:bg-royal-pale disabled:opacity-40'
  return (
    <div className="flex flex-col gap-3">
      {zoomable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => step(-1)}
            disabled={zoom <= Math.min(fitted, ZOOMS[0]) + 0.01}
            className={btn}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="w-14 text-center text-sm font-semibold">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => step(1)}
            disabled={zoom >= 1}
            className={btn}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          {chosen !== null && (
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="ml-1 inline-flex min-h-[44px] items-center rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale"
            >
              Fit to screen
            </button>
          )}
        </div>
      )}
      <div ref={box} className={zoomable ? 'overflow-auto pb-2' : 'overflow-hidden'}>
        <Plan plan={plan} zoom={zoom} anonymous={anonymous} />
      </div>
    </div>
  )
}

function Plan({
  plan,
  zoom = 1,
  anonymous,
}: {
  plan: SharedRoomPlan
  zoom?: number
  anonymous: boolean
}) {
  const section = (s: PlanSection) => (
    <div style={{ marginTop: (s.down ?? 0) * CELL }} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{s.name}</span>
      <div
        className="relative rounded-xl"
        style={{
          width: s.cols * CELL,
          height: s.rows * CELL,
          backgroundColor: 'white',
          backgroundImage: 'radial-gradient(#A3ABB6 1.5px, transparent 1.6px)',
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition: `-${CELL / 2}px -${CELL / 2}px`,
        }}
      >
        {plan.tiles
          .filter((t) => t.sectionId === s.id)
          .map((t) => (
            <PlanTileView key={t.id} tile={t} anonymous={anonymous} />
          ))}
      </div>
    </div>
  )
  return (
    <div style={{ zoom }} className="flex w-max flex-col items-start gap-4">
      {sectionBands(plan.sections).map((band) =>
        'across' in band ? (
          <div key={band.across.id}>{section(band.across)}</div>
        ) : (
          <div key={band.columns[0][0].id} className="flex items-stretch gap-5">
            {band.columns.map((column, c) => (
              <div key={column[0].id} className="flex items-stretch gap-5">
                {c > 0 && <span aria-hidden="true" className="w-px bg-line" />}
                <div className="flex flex-col items-start gap-4">
                  {column.map((s) => (
                    <div key={s.id}>{section(s)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function PlanTileView({ tile, anonymous }: { tile: SharedPlanTile; anonymous: boolean }) {
  const style = {
    left: tile.x * CELL + 3,
    top: tile.y * CELL + 3,
    width: tile.w * CELL - 6,
    height: tile.h * CELL - 6,
  }
  if (tile.landmark)
    return (
      <div
        className="absolute flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-[1.5px] border-line p-2 text-center text-[13px] font-semibold shadow-card"
        style={{ ...style, ...LANDMARK_FLOOR[tile.landmark.kind] }}
      >
        <LandmarkPicture
          kind={tile.landmark.kind}
          turn={tile.landmark.turn}
          className="relative min-h-0 w-full flex-1"
        />
        <span className="max-w-full shrink-0 truncate rounded-full bg-white/90 px-2 text-[12px]">
          {tile.landmark.label}
        </span>
      </div>
    )
  if (!tile.room) return null
  // Drawn as the room planner draws it (owner's ask, 2026-11-28): each bed's picture with its places under it.
  const room = tile.room
  const beds = room.bedTypes.map((type, bed) => ({
    type,
    places: room.places.filter((p) => p.bed === bed),
  }))
  const extra = room.places.filter((p) => p.bed === null)
  const chips = (places: typeof room.places) =>
    places.map((p) => <Chip key={p.index} p={p} anonymous={anonymous} />)
  return (
    <div
      className="absolute flex flex-col gap-2 overflow-hidden rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 shadow-card"
      style={style}
    >
      <strong className="shrink-0 truncate font-display text-[15px]">{room.name}</strong>
      <div className="flex flex-1 flex-wrap items-start justify-center gap-4 rounded-[10px] border border-royal/20 bg-royal-pale px-2 py-2.5">
        {beds.map((b, i) =>
          b.type === 'bunk' ? (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-1">
                <BedPicture type="bunk" className="h-[72px] w-auto" />
                <span className="text-[10px] font-semibold text-royal-dark">Bunk</span>
              </div>
              <div className="flex flex-col gap-3 pt-1.5">{chips(b.places)}</div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-center gap-1">
              <BedPicture type={b.type} className="h-16 w-auto" />
              <span className="text-[10px] font-semibold text-royal-dark">
                {BED_LABELS[b.type].label}
              </span>
              {chips(b.places)}
            </div>
          )
        )}
        {extra.length > 0 && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-royal-dark">
              {room.bedTypes.length ? 'Extra places' : 'Places'}
            </span>
            {chips(extra)}
          </div>
        )}
      </div>
    </div>
  )
}
