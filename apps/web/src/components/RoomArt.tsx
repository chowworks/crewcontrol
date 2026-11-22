import type { CSSProperties, ReactNode } from 'react'
import { BED_LABELS, type BedType, type LandmarkKind } from '@cc/types'

// Bed sizes seen from above, in the picture's units: a twin is narrow, a king nearly twice as wide.
const BED_WIDTH: Record<BedType, number> = {
  king: 46,
  queen: 40,
  double: 36,
  twin: 24,
  daybed: 30,
  'sofa-bed': 40,
  bunk: 30,
}

// The word under each bed, so beds of a similar size can't be mistaken for each other.
const BED_WORD: Record<BedType, string> = {
  king: 'King',
  queen: 'Queen',
  double: 'Double',
  twin: 'Twin',
  daybed: 'Daybed',
  'sofa-bed': 'Sofa',
  bunk: 'Bunk',
}

/** A small top-down picture of a room's beds, so guests can see what they're choosing. */
export function RoomArt({ beds, className = '' }: { beds: BedType[]; className?: string }) {
  const gap = 8
  const pad = 10
  const width = Math.max(
    80,
    beds.reduce((w, b) => w + BED_WIDTH[b], 0) + gap * Math.max(0, beds.length - 1) + pad * 2
  )
  let x = pad
  return (
    <svg
      viewBox={`0 0 ${width} 86`}
      className={className}
      role="img"
      aria-label={beds.length ? beds.map((b) => BED_LABELS[b].label).join(', ') : 'Beds not set'}
    >
      <rect x="1" y="1" width={width - 2} height="84" rx="10" fill="#F1ECF8" stroke="#D9CCEB" />
      {beds.map((bed, i) => {
        const w = BED_WIDTH[bed]
        const left = x
        x += w + gap
        return (
          <g key={i}>
            <Bed type={bed} x={left} w={w} />
            <text
              x={left + w / 2}
              y="77"
              textAnchor="middle"
              fontSize="8"
              fontWeight="600"
              fill="#3F1E66"
            >
              {BED_WORD[bed]}
            </text>
          </g>
        )
      })}
      {beds.length === 0 && (
        <text x={width / 2} y="42" textAnchor="middle" fontSize="10" fill="#4A5568">
          Beds not set
        </text>
      )}
    </svg>
  )
}

/** One bed's picture on its own, the same drawing as the room art, for the room planner (issue #93). */
export function BedPicture({
  type,
  className = 'h-16 w-auto',
}: {
  type: BedType
  className?: string
}) {
  const w = BED_WIDTH[type]
  return (
    <svg
      viewBox={`-2 6 ${w + 4} 62`}
      className={className}
      role="img"
      aria-label={BED_LABELS[type].label}
    >
      <Bed type={type} x={0} w={w} />
    </svg>
  )
}

function Bed({ type, x, w }: { type: BedType; x: number; w: number }) {
  // A bunk is drawn from the side, so its two levels show: posts, two mattresses and a ladder.
  if (type === 'bunk')
    return (
      <g>
        <rect x={x} y="10" width="3" height="56" rx="1.5" fill="#5A2D91" />
        <rect x={x + w - 3} y="10" width="3" height="56" rx="1.5" fill="#5A2D91" />
        <rect x={x + 2} y="20" width={w - 4} height="8" rx="2" fill="#5A2D91" opacity="0.85" />
        <rect x={x + 4} y="16" width="8" height="4" rx="2" fill="#F2B33D" />
        <rect x={x + 2} y="50" width={w - 4} height="8" rx="2" fill="#5A2D91" opacity="0.85" />
        <rect x={x + 4} y="46" width="8" height="4" rx="2" fill="#F2B33D" />
        <line x1={x + w - 9} y1="28" x2={x + w - 9} y2="50" stroke="#3F1E66" strokeWidth="1.5" />
        {[34, 40, 46].map((y) => (
          <line
            key={y}
            x1={x + w - 9}
            y1={y}
            x2={x + w - 3}
            y2={y}
            stroke="#3F1E66"
            strokeWidth="1.5"
          />
        ))}
      </g>
    )
  if (type === 'sofa-bed')
    return (
      <g>
        <rect x={x} y="14" width={w} height="48" rx="6" fill="#5A2D91" />
        <rect x={x + 4} y="22" width={w - 8} height="36" rx="4" fill="#fff" />
        <rect x={x + 6} y="26" width={w - 12} height="7" rx="3" fill="#F2B33D" />
      </g>
    )
  const pillows = BED_LABELS[type].sleeps === 2 ? 2 : 1
  const pw = (w - 8 - (pillows - 1) * 3) / pillows
  return (
    <g>
      {type === 'daybed' && (
        <rect x={x - 2} y="10" width={w + 4} height="6" rx="3" fill="#5A2D91" />
      )}
      <rect
        x={x}
        y="14"
        width={w}
        height="50"
        rx="5"
        fill="#fff"
        stroke="#5A2D91"
        strokeWidth="2"
      />
      <rect x={x} y="36" width={w} height="28" rx="4" fill="#5A2D91" opacity="0.85" />
      {Array.from({ length: pillows }, (_, i) => (
        <rect key={i} x={x + 4 + i * (pw + 3)} y="19" width={pw} height="9" rx="3" fill="#F2B33D" />
      ))}
    </g>
  )
}

/** Plain words for who shares what in a room, for the picker and the editor. */
export function sharingLine(room: { bedTypes: BedType[]; capacity: number }): string {
  const parts: string[] = []
  const onlyBed = room.bedTypes.length === 1 ? room.bedTypes[0] : null
  if (onlyBed && BED_LABELS[onlyBed].sleeps >= 2 && room.capacity >= 2 && onlyBed !== 'bunk')
    parts.push(`One ${BED_LABELS[onlyBed].label.toLowerCase()} bed, shared by ${room.capacity}.`)
  else if (room.capacity > 1) parts.push(`Shared room for up to ${room.capacity}.`)
  else parts.push('A room for one.')
  return parts.join(' ')
}

const R = '#5A2D91'
const RD = '#3F1E66'
const PALE = '#F1ECF8'
const GOLD = '#F2B33D'

/** What each landmark's floor looks like behind its picture on the room planner. */
export const LANDMARK_FLOOR: Record<LandmarkKind, CSSProperties> = {
  entry: {
    backgroundColor: '#FFFFFF',
    backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 9px, #F3F6F5 9px 18px)',
  },
  bath: {
    backgroundColor: '#FAFBFC',
    backgroundImage:
      'linear-gradient(#E2E8EA 1px, transparent 1px), linear-gradient(90deg, #E2E8EA 1px, transparent 1px)',
    backgroundSize: '12px 12px',
  },
  halfbath: {
    backgroundColor: '#FAFBFC',
    backgroundImage:
      'linear-gradient(#E2E8EA 1px, transparent 1px), linear-gradient(90deg, #E2E8EA 1px, transparent 1px)',
    backgroundSize: '12px 12px',
  },
  kitchen: {
    backgroundColor: '#FFFFFF',
    backgroundImage: 'conic-gradient(#F3F6F5 25%, transparent 0 50%, #F3F6F5 0 75%, transparent 0)',
    backgroundSize: '20px 20px',
  },
  dining: {
    backgroundColor: '#F7EBD3',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 13px, #E9D6B0 13px 14px)',
  },
  living: { backgroundColor: '#FFFFFF' },
  stairs: { backgroundColor: '#FFFFFF' },
  hall: {
    backgroundColor: '#F7EBD3',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 13px, #E9D6B0 13px 14px)',
  },
  outdoor: {
    backgroundColor: '#F7EBD3',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 13px, #E9D6B0 13px 14px)',
  },
  pool: {
    backgroundColor: '#F7EBD3',
    backgroundImage:
      'linear-gradient(#E9D6B0 1px, transparent 1px), linear-gradient(90deg, #E9D6B0 1px, transparent 1px)',
    backgroundSize: '16px 16px',
  },
  other: { backgroundColor: '#F3F6F5' },
}

/** A small top-down picture of a landmark on the room planner, drawn like the beds (issue #93). */
export function LandmarkPicture({
  kind,
  turn = 0,
  className = '',
}: {
  kind: LandmarkKind
  /** Quarter turns clockwise: a turned picture is tall, so its box turns too. */
  turn?: number
  className?: string
}) {
  const t = ((turn % 4) + 4) % 4
  const turned = [
    undefined,
    'translate(56 0) rotate(90)',
    'rotate(180 40 28)',
    'translate(0 80) rotate(-90)',
  ][t]
  return (
    <svg viewBox={t % 2 ? '0 0 56 80' : '0 0 80 56'} className={className} aria-hidden="true">
      <g transform={turned}>{LANDMARK_ART[kind]}</g>
    </svg>
  )
}

const line = { fill: '#fff', stroke: R, strokeWidth: 2 }

const LANDMARK_ART: Record<LandmarkKind, ReactNode> = {
  // The front door swinging open onto a welcome mat.
  entry: (
    <g>
      <rect x="8" y="4" width="64" height="5" rx="2" fill={RD} />
      <path
        d="M22 9 A30 30 0 0 1 52 39"
        fill="none"
        stroke={R}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <rect x="20" y="9" width="5" height="32" rx="2" fill={R} />
      <circle cx="22.5" cy="36" r="1.8" fill={GOLD} />
      <rect x="28" y="42" width="30" height="11" rx="3" fill={GOLD} />
      <rect
        x="31"
        y="45"
        width="24"
        height="5"
        rx="2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.2"
      />
    </g>
  ),
  // A tub, a toilet and a sink.
  bath: (
    <g>
      <rect x="3" y="4" width="34" height="48" rx="9" {...line} />
      <rect x="8" y="9" width="24" height="38" rx="10" fill={PALE} />
      <circle cx="20" cy="12" r="2.5" fill={GOLD} />
      <rect x="51" y="4" width="22" height="7" rx="2" fill={R} />
      <ellipse cx="62" cy="22" rx="8" ry="10" {...line} />
      <rect x="49" y="38" width="26" height="15" rx="4" {...line} />
      <ellipse cx="62" cy="46" rx="7" ry="4" fill={PALE} />
      <circle cx="62" cy="40.5" r="1.8" fill={GOLD} />
    </g>
  ),
  // A toilet and a sink, no tub.
  halfbath: (
    <g>
      <rect x="10" y="4" width="22" height="7" rx="2" fill={R} />
      <ellipse cx="21" cy="25" rx="9" ry="12" {...line} />
      <rect x="44" y="8" width="28" height="18" rx="4" {...line} />
      <ellipse cx="58" cy="18" rx="8" ry="5" fill={PALE} />
      <circle cx="58" cy="11" r="1.8" fill={GOLD} />
    </g>
  ),
  // A counter with a stove and a sink, and an island with stools.
  // A table seen from above, with a chair at each place and one at each end.
  dining: (
    <g>
      {[22, 40, 58].map((x) => (
        <g key={x}>
          <rect x={x - 6} y="4" width="12" height="9" rx="3" fill={GOLD} />
          <rect x={x - 6} y="43" width="12" height="9" rx="3" fill={GOLD} />
        </g>
      ))}
      <rect x="2" y="22" width="9" height="12" rx="3" fill={GOLD} />
      <rect x="69" y="22" width="9" height="12" rx="3" fill={GOLD} />
      <rect x="13" y="15" width="54" height="26" rx="5" fill={R} />
      <circle cx="40" cy="28" r="5" fill={PALE} />
    </g>
  ),
  kitchen: (
    <g>
      <rect x="2" y="3" width="76" height="17" rx="3" {...line} />
      {[9, 23].map((x) =>
        [8, 15].map((y) => (
          <circle
            key={`${x}${y}`}
            cx={x}
            cy={y}
            r="2.6"
            fill="none"
            stroke={GOLD}
            strokeWidth="2"
          />
        ))
      )}
      <rect x="44" y="6" width="20" height="11" rx="3" fill={PALE} stroke={R} strokeWidth="1.5" />
      <circle cx="54" cy="6" r="1.6" fill={GOLD} />
      <rect x="18" y="28" width="44" height="13" rx="4" fill={R} />
      {[26, 40, 54].map((x) => (
        <circle key={x} cx={x} cy="49" r="4" fill={GOLD} />
      ))}
    </g>
  ),
  // A sofa on a rug, a coffee table and a chair.
  living: (
    <g>
      <rect x="6" y="16" width="62" height="36" rx="5" fill="#FBEBC8" />
      <rect x="4" y="3" width="56" height="15" rx="5" fill={R} />
      <rect x="9" y="8" width="22" height="9" rx="3" fill="#7B4FB5" />
      <rect x="33" y="8" width="22" height="9" rx="3" fill="#7B4FB5" />
      <rect x="20" y="27" width="30" height="13" rx="3" {...line} />
      <circle cx="35" cy="33.5" r="2.5" fill={GOLD} />
      <rect x="60" y="24" width="16" height="18" rx="5" fill={RD} />
      <rect x="63" y="28" width="10" height="10" rx="3" fill="#7B4FB5" />
    </g>
  ),
  // A staircase from the side: steps going up, with a rail.
  stairs: (
    <g>
      <path
        d="M6 52 V44 H18 V36 H30 V28 H42 V20 H54 V12 H66 V4 H74 V52 Z"
        fill={R}
        stroke={RD}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {[44, 36, 28, 20, 12, 4].map((y, i) => (
        <rect key={y} x={6 + i * 12} y={y} width={i === 5 ? 8 : 12} height="2.5" fill="#7B4FB5" />
      ))}
      <path d="M10 34 L70 -6" stroke={GOLD} strokeWidth="3" strokeLinecap="round" fill="none" />
      {[12, 24, 36, 48, 60].map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={44 - i * 8}
          x2={x}
          y2={34 - (x - 10) * (40 / 60)}
          stroke={GOLD}
          strokeWidth="1.5"
        />
      ))}
    </g>
  ),
  // A runner rug down a hallway, with a door at each end.
  hall: (
    <g>
      <rect x="2" y="21" width="76" height="14" rx="3" fill={R} />
      <rect x="6" y="24" width="68" height="8" rx="2" fill="none" stroke={GOLD} strokeWidth="1.5" />
      {[18, 30, 42, 54, 66].map((x) => (
        <circle key={x} cx={x - 4} cy="28" r="1.3" fill={GOLD} />
      ))}
      <rect x="0" y="8" width="3" height="40" rx="1.5" fill={RD} />
      <rect x="77" y="8" width="3" height="40" rx="1.5" fill={RD} />
    </g>
  ),
  // A table with chairs and a lounger.
  outdoor: (
    <g>
      <circle cx="28" cy="28" r="11" {...line} />
      <circle cx="28" cy="28" r="3" fill={GOLD} />
      {[
        [28, 10],
        [28, 46],
        [10, 28],
        [46, 28],
      ].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x - 5} y={y - 5} width="10" height="10" rx="3" fill={R} />
      ))}
      <rect x="58" y="6" width="16" height="44" rx="5" fill={RD} />
      <rect x="61" y="9" width="10" height="10" rx="3" fill={GOLD} />
    </g>
  ),
  // A pool with its ladder and a hot tub.
  pool: (
    <g>
      <rect x="3" y="5" width="52" height="46" rx="8" fill={PALE} stroke={R} strokeWidth="2.5" />
      {[17, 28, 39].map((y) => (
        <path
          key={y}
          d={`M10 ${y} q5 -4 10 0 t10 0 t10 0 t10 0`}
          fill="none"
          stroke="#B79BDB"
          strokeWidth="1.8"
        />
      ))}
      <line x1="44" y1="5" x2="44" y2="13" stroke={GOLD} strokeWidth="2" />
      <line x1="50" y1="5" x2="50" y2="13" stroke={GOLD} strokeWidth="2" />
      <circle cx="68" cy="40" r="10" fill={PALE} stroke={R} strokeWidth="2.5" />
      <circle cx="68" cy="40" r="3" fill={GOLD} />
    </g>
  ),
  // A door and a shelf: a closet, a laundry, a garage.
  other: (
    <g>
      <rect x="10" y="6" width="26" height="46" rx="2" {...line} />
      <circle cx="31" cy="30" r="2" fill={GOLD} />
      <rect x="46" y="6" width="26" height="46" rx="3" fill={PALE} stroke={R} strokeWidth="2" />
      {[18, 30, 42].map((y) => (
        <line key={y} x1="46" y1={y} x2="72" y2={y} stroke={R} strokeWidth="2" />
      ))}
      <rect x="50" y="11" width="7" height="7" rx="1.5" fill={GOLD} />
      <rect x="60" y="24" width="8" height="6" rx="1.5" fill={R} />
    </g>
  ),
}
