import type { OrganizerTrip } from '@cc/types'
import { Copy, ExternalLink, FileImage, Megaphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/Toast'

// Drawn 36px tall, as Request a feature is; the ::after keeps the tap area at 44px.
const small =
  'relative inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold after:absolute after:-inset-1'
const outline = `${small} bg-white text-royal hover:bg-royal-pale`

/**
 * Above Actions on Trip Control: the trip's cover photo, the trip page's link to copy into the crew's text thread, and
 * the flyer, on royal-pale as "Missing something" is (owner's decision, 2026-11-01).
 */
export function TripLinkCard({ trip, onFlyer }: { trip: OrganizerTrip; onFlyer: () => void }) {
  const toast = useToast()
  const url = `${window.location.origin}/t/${trip.slug}`
  const cover = trip.photos[0]?.url
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast({ text: 'Trip link copied.' })
    } catch {
      // Some browsers refuse the clipboard; the link is right there to select by hand.
    }
  }
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-royal-pale p-3 pr-4">
      {cover ? (
        <img src={cover} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-white">
          <Megaphone className="h-6 w-6 text-royal" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-[1_1_180px]">
        <h2 className="font-extrabold text-ink">
          {trip.published ? 'Advertise your trip' : 'Your trip link'}
        </h2>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-semibold text-royal hover:underline"
        >
          {url.replace(/^https?:\/\//, '')}
        </a>
        {!trip.published && (
          <p className="text-sm text-body">
            Guests can open it once the trip is published.{' '}
            <Link to={`/organize/${trip.id}?step=6`} className="font-semibold text-royal underline">
              Publish the trip
            </Link>
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className={`${small} bg-royal text-white hover:bg-royal-dark`}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy link
        </button>
        <button type="button" onClick={onFlyer} className={outline}>
          <FileImage className="h-4 w-4" aria-hidden="true" />
          Flyer
        </button>
        <a href={url} target="_blank" rel="noreferrer" className={outline}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open
        </a>
      </div>
    </section>
  )
}
