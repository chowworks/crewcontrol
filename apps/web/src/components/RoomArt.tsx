import { BED_LABELS, type BedType } from '@cc/types'

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
export function sharingLine(room: {
  bedTypes: BedType[]
  capacity: number
  minPeople: number
}): string {
  const parts: string[] = []
  const onlyBed = room.bedTypes.length === 1 ? room.bedTypes[0] : null
  if (onlyBed && BED_LABELS[onlyBed].sleeps >= 2 && room.capacity >= 2 && onlyBed !== 'bunk')
    parts.push(`One ${BED_LABELS[onlyBed].label.toLowerCase()} bed, shared by ${room.capacity}.`)
  else if (room.capacity > 1) parts.push(`Shared room for up to ${room.capacity}.`)
  else parts.push('A room for one.')
  if (room.minPeople > 1)
    parts.push(
      `Priced for ${room.minPeople}: book it with fewer and you pay for the empty ${
        room.minPeople === 2 ? 'place' : 'places'
      } too.`
    )
  return parts.join(' ')
}
