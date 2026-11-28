import {
  BED_LABELS,
  PLAN_CELL_PX,
  type BedType,
  type LandmarkKind,
  type PlanSection,
} from '@cc/types'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { BedPicture, LANDMARK_FLOOR, LandmarkPicture } from '@/components/RoomArt'
import { sectionBands } from '@/lib/roomPlan'

/**
 * The drawing of a floor plan, shared by the room planner and the plan guests see on the trip page (owner's ask,
 * 2026-11-28: the two must look the same). Each part takes the planner's controls as slots, so the guest view is the
 * planner with them left out.
 */

const CELL = PLAN_CELL_PX

/** The parts of the house as the organizer arranged them: columns side by side, a line between, some across. */
export function PlanBands({
  sections,
  renderSection,
}: {
  sections: PlanSection[]
  renderSection: (s: PlanSection) => ReactNode
}) {
  return (
    <>
      {sectionBands(sections).map((band) =>
        'across' in band ? (
          <div key={band.across.id}>{renderSection(band.across)}</div>
        ) : (
          <div key={band.columns[0][0].id} className="flex items-stretch gap-5">
            {band.columns.map((column, c) => (
              <div key={column[0].id} className="flex items-stretch gap-5">
                {c > 0 && <span aria-hidden="true" className="w-px bg-line" />}
                <div className="flex flex-col items-start gap-4">
                  {column.map((s) => (
                    <div key={s.id}>{renderSection(s)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </>
  )
}

/** One part of the house: its name over a line, then its dotted grid holding the rooms and landmarks. */
export function PlanSectionFrame({
  section,
  name,
  end,
  top,
  gridRef,
  gridClassName = '',
  gridId,
  children,
  after,
}: {
  section: PlanSection
  /** The name, or the planner's handle and rename controls around it. */
  name?: ReactNode
  /** After the line, like the planner's Remove button. */
  end?: ReactNode
  /** Before the heading, like the planner's handle for moving the part up or down. */
  top?: ReactNode
  gridRef?: Ref<HTMLDivElement>
  gridClassName?: string
  gridId?: string
  children: ReactNode
  /** Beside the grid, like the planner's drop zones. */
  after?: ReactNode
}) {
  return (
    <div
      className="relative flex flex-col gap-2.5"
      style={{ width: section.cols * CELL, marginTop: (section.down ?? 0) * CELL }}
    >
      {top}
      <div className="flex min-h-9 items-center gap-2">
        {name ?? <span className="text-sm font-semibold text-muted">{section.name}</span>}
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        {end}
      </div>
      <div className="relative">
        <div
          ref={gridRef}
          data-grid={gridId}
          className={`relative rounded-xl ${gridClassName}`}
          style={{
            width: section.cols * CELL,
            height: section.rows * CELL,
            backgroundColor: 'white',
            backgroundImage: 'radial-gradient(#A3ABB6 1.5px, transparent 1.6px)',
            backgroundSize: `${CELL}px ${CELL}px`,
            backgroundPosition: `-${CELL / 2}px -${CELL / 2}px`,
          }}
        >
          {children}
        </div>
        {after}
      </div>
    </div>
  )
}

/** Where a tile sits on its grid, in pixels. */
export const tileBox = (t: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  left: t.x * CELL + 3,
  top: t.y * CELL + 3,
  width: t.w * CELL - 6,
  height: t.h * CELL - 6,
})

/** A bathroom, the stairs or another landmark: its picture and its name. */
export function LandmarkTileFrame({
  style,
  kind,
  turn,
  label,
  className = '',
  under,
  children,
}: {
  style: CSSProperties
  kind: LandmarkKind
  turn?: number
  /** The name, or the planner's button to rename it. */
  label: ReactNode
  className?: string
  /** Under the picture: the planner's drag area. */
  under?: ReactNode
  /** Over it: the planner's buttons and resize corner. */
  children?: ReactNode
}) {
  return (
    <div
      className={`absolute flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-[1.5px] border-line p-2 text-center text-[13px] font-semibold shadow-card ${className}`}
      style={{ ...style, ...LANDMARK_FLOOR[kind] }}
    >
      {under}
      <LandmarkPicture
        kind={kind}
        turn={turn}
        className="pointer-events-none relative min-h-0 w-full flex-1"
      />
      {label}
      {children}
    </div>
  )
}

export const landmarkLabelClass =
  'relative max-w-full shrink-0 truncate rounded-full bg-white/90 px-2 text-[12px]'

/** A room: its heading, then each bed's picture with its places under it (a bunk's beside it). */
export function RoomTileFrame<S extends { index: number; bed: number | null }>({
  style,
  head,
  bedTypes,
  spots,
  renderSpot,
  className = 'border-line',
  tileRef,
  children,
}: {
  style: CSSProperties
  /** The room's name, and on the planner its price, size and buttons. */
  head: ReactNode
  bedTypes: BedType[]
  spots: S[]
  renderSpot: (s: S) => ReactNode
  /** The border: the planner turns it royal while someone is dragged over. */
  className?: string
  tileRef?: Ref<HTMLDivElement>
  /** The planner's resize corner. */
  children?: ReactNode
}) {
  const beds = bedTypes.map((type, bed) => ({ type, spots: spots.filter((s) => s.bed === bed) }))
  const extra = spots.filter((s) => s.bed === null)
  return (
    <div
      ref={tileRef}
      className={`group absolute flex flex-col gap-2 overflow-hidden rounded-xl border-[1.5px] bg-white px-3 py-2.5 shadow-card ${className}`}
      style={style}
    >
      {head}
      <div className="flex flex-1 flex-wrap items-start justify-center gap-4 rounded-[10px] border border-royal/20 bg-royal-pale px-2 py-2.5">
        {beds.map((b, i) =>
          b.type === 'bunk' ? (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-1">
                <BedPicture type="bunk" className="h-[72px] w-auto" />
                <span className="text-[10px] font-semibold text-royal-dark">Bunk</span>
              </div>
              <div className="flex flex-col gap-3 pt-1.5">{b.spots.map(renderSpot)}</div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-center gap-1">
              <BedPicture type={b.type} className="h-16 w-auto" />
              <span className="text-[10px] font-semibold text-royal-dark">
                {BED_LABELS[b.type].label}
              </span>
              {b.spots.map(renderSpot)}
            </div>
          )
        )}
        {extra.length > 0 && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-royal-dark">
              {bedTypes.length ? 'Extra places' : 'Places'}
            </span>
            {extra.map(renderSpot)}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
