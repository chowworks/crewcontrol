import { Link } from 'react-router-dom'

/**
 * The CrewControl mark and wordmark. The mark is a group-chat bubble with a paper plane flying out of it:
 * "Get your trip out the group chat." Same drawing as public/favicon.svg.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#5A2D91" />
      <path
        d="M33 16H21a8 8 0 0 0-8 8v11a8 8 0 0 0 8 8h3v7.5l9.5-7.5H43a8 8 0 0 0 8-8v-3"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(33 7) scale(1.15)">
        <path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D" />
        <path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22" />
      </g>
    </svg>
  )
}

/** The mark and wordmark, linking to the homepage. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="CrewControl home"
      className={`inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-royal ${className}`}
    >
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">
        Crew<span className="text-royal">Control</span>
      </span>
    </Link>
  )
}
