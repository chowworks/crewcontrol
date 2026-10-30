/** The speech bubble and paper plane in the corner of the trip page's dark purple boxes. */
export function TileArt() {
  return (
    <svg
      viewBox="0 0 200 120"
      className="pointer-events-none absolute right-4 top-4 h-16 w-auto"
      aria-hidden="true"
    >
      <path
        d="M108 22H70a22 22 0 0 0-22 22v30a22 22 0 0 0 22 22h8v20l26-20h28a22 22 0 0 0 22-22v-8"
        fill="none"
        stroke="#fff"

        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(112 0) scale(2.1)">
        <path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D" />
        <path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22" />
      </g>
    </svg>
  )
}
