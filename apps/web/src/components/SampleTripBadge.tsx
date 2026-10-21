/** Marks demo content, so nobody mistakes the seed trips for real organizers' trips. */
export function SampleTripBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-ink/80 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-marigold" aria-hidden="true" />
      Sample Trip
    </span>
  )
}
