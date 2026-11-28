import {
  BED_LABELS,
  PLAN_CELL_PX,
  type PlanSection,
  type SharedPlanTile,
  type SharedRoomPlan,
} from '@cc/types'
import { Minus, Plus, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import {
  LandmarkTileFrame,
  PlanBands,
  PlanSectionFrame,
  RoomTileFrame,
  landmarkLabelClass,
  tileBox,
} from '@/components/PlanParts'
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
 * guests by name, anyone else "Taken"); everyone else (`anonymous`, a button below the room cards) sees only the rooms
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

  // Everyone else gets a button below the room cards that opens the plan (owner's decision, 2026-11-28).
  if (anonymous)
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center self-stretch rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale sm:self-start"
        >
          View full floor plan
        </button>
        {open && (
          <Dialog title="Floor plan" wide onClose={() => setOpen(false)}>
            <FittedPlan plan={plan} zoomable anonymous />
            {/* A plug for the paid room planner (owner's ask, 2026-11-28). */}
            <p className="mt-4 rounded-xl bg-royal-pale px-4 py-3 text-sm">
              Your organizer drew this with Travel HQ’s room planner, a paid feature for organizers.{' '}
              <Link to="/" className="font-semibold text-royal underline">
                Plan your own trip
              </Link>
            </p>
          </Dialog>
        )}
      </>
    )

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[26px] font-extrabold">Where everyone sleeps</h2>
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
                        <Chip key={p.index} p={p} anonymous={false} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* A computer: the plan the organizer drew, shrunk to fit. */}
        <div className="hidden lg:block">
          <FittedPlan plan={plan} />
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
          The plan your organizer drew, as they last applied rooms.
        </p>
      </div>
      {open && (
        <Dialog title="Where everyone sleeps" wide onClose={() => setOpen(false)}>
          <FittedPlan plan={plan} zoomable />
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
  return (
    <div style={{ zoom }} className="flex w-max flex-col items-start gap-4 pt-3">
      <PlanBands
        sections={plan.sections}
        renderSection={(s) => (
          <PlanSectionFrame section={s}>
            {plan.tiles
              .filter((t) => t.sectionId === s.id)
              .map((t) => (
                <PlanTileView key={t.id} tile={t} anonymous={anonymous} />
              ))}
          </PlanSectionFrame>
        )}
      />
    </div>
  )
}

/** A tile as the room planner draws it (the same parts), with no prices or controls. */
function PlanTileView({ tile, anonymous }: { tile: SharedPlanTile; anonymous: boolean }) {
  if (tile.landmark)
    return (
      <LandmarkTileFrame
        style={tileBox(tile)}
        kind={tile.landmark.kind}
        turn={tile.landmark.turn}
        label={<span className={landmarkLabelClass}>{tile.landmark.label}</span>}
      />
    )
  if (!tile.room) return null
  return (
    <RoomTileFrame
      style={tileBox(tile)}
      head={
        <strong className="shrink-0 truncate font-display text-[15px]">{tile.room.name}</strong>
      }
      bedTypes={tile.room.bedTypes}
      spots={tile.room.places}
      renderSpot={(p) => <Chip key={p.index} p={p} anonymous={anonymous} />}
    />
  )
}
