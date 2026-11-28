import {
  BED_LABELS,
  PLAN_CELL_PX,
  type PlanSection,
  type SharedPlanTile,
  type SharedRoomPlan,
} from '@cc/types'
import { User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import {
  LandmarkTileFrame,
  PlanBands,
  PlanSectionFrame,
  PlanZoomBar,
  RoomTileFrame,
  landmarkLabelClass,
  stepPlanZoom,
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

/**
 * The floor plan an organizer shared, as last applied, with no prices: a button below the room cards that opens it,
 * the same for everyone (owner's decisions, 2026-11-28). Accepted guests see who sleeps where (accepted guests by
 * name, anyone else "Taken") when the organizer shared names; everyone else (`anonymous`) sees only the rooms and
 * their beds, every place the same.
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
  const where = mine?.room && (
    <p className="rounded-xl bg-royal-pale px-4 py-3">
      <strong>You’re in the {mine.room.name}</strong>
      {myBed ? `, on the ${BED_LABELS[myBed].label} bed.` : '.'}
    </p>
  )

  return (
    <>
      {where}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center justify-center self-stretch rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale sm:self-start"
      >
        View full floor plan
      </button>
      {open && (
        <Dialog title="Floor plan" wide onClose={() => setOpen(false)}>
          {mine?.room && <p className="mb-3 text-sm text-muted">Your spot has a gold ring.</p>}
          <ZoomablePlan plan={plan} anonymous={anonymous} />
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

/**
 * The plan in the dialog with the room planner's zoom bar (owner's ask, 2026-11-28): it opens fitted to the screen,
 * steps in and out, and a drag anywhere on it moves it around, as a hand would.
 */
function ZoomablePlan({ plan, anonymous }: { plan: SharedRoomPlan; anonymous: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const fit = () => {
    const el = box.current
    if (el) setZoom(Math.min(1, (el.clientWidth - 8) / Math.max(1, planWidth(plan.sections) + 4)))
  }
  useEffect(fit, [plan.sections])
  return (
    <div className="flex flex-col gap-3">
      <PlanZoomBar
        zoom={zoom}
        onStep={(d) =>
          setZoom((z) => (d < 0 ? Math.min(z, stepPlanZoom(z, d)) : stepPlanZoom(z, d)))
        }
        onFit={fit}
      />
      <div
        ref={box}
        className={`max-h-[65vh] touch-none overflow-auto pb-2 ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(e) => {
          const el = box.current
          if (!el || e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
          el.setPointerCapture(e.pointerId)
          setGrabbing(true)
        }}
        onPointerMove={(e) => {
          const el = box.current
          const d = drag.current
          if (!el || !d) return
          el.scrollLeft = d.left - (e.clientX - d.x)
          el.scrollTop = d.top - (e.clientY - d.y)
        }}
        onPointerUp={() => {
          drag.current = null
          setGrabbing(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setGrabbing(false)
        }}
      >
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
