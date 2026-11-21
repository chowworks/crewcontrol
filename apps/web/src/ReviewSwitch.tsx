import { Link, useLocation } from 'react-router-dom'

/**
 * Review only (CLAUDE.md, "Design experiments"): a pill at the bottom left that flips a page between the options of one
 * experiment, keeping the other query parameters. Never left in a finished screen.
 */
export function ReviewSwitch({
  param,
  options,
}: {
  param: string
  options: { value: string; label: string }[]
}) {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const current = params.get(param)
  const to = (value: string) => {
    const next = new URLSearchParams(search)
    next.set(param, value)
    return `${pathname}?${next}`
  }
  return (
    <nav
      aria-label="Design options"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-full bg-ink p-1 text-sm font-semibold text-white shadow-lg"
    >
      {options.map((o) => (
        <Link
          key={o.value}
          to={to(o.value)}
          className={`rounded-full px-3 py-1.5 ${current === o.value ? 'bg-marigold text-ink' : 'hover:bg-white/10'}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  )
}
