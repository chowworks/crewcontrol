import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'
import { useToast } from '@/components/Toast'
import { rowButton, TripList } from '@/components/TripList'
import { api, type ListedTrip } from '@/lib/api'

export function TripsPage() {
  const [trips, setTrips] = useState<ListedTrip[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()

  useEffect(() => {
    const load = () =>
      api
        .listTrips()
        .then(setTrips)
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : 'Trips could not be loaded. Is the API running?'
          )
        )
    load()
    // A trip deleted and then put back with the toast's Undo.
    window.addEventListener('cc:trips-changed', load)
    return () => window.removeEventListener('cc:trips-changed', load)
  }, [])

  async function restore(t: ListedTrip) {
    setError(null)
    try {
      await api.restoreTrip(t.id)
      setTrips(await api.listTrips())
      toast({ text: `Restored ${t.name}. Publish it again when you’re ready.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trip was not restored.')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to="/organize/new"
            aria-label="New trip"
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-royal px-3.5 font-semibold text-white hover:bg-royal-dark sm:gap-2 sm:px-4"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {/* "New" on a phone, so the header fits on one line beside the logo and the account menu. */}
            New<span className="hidden sm:inline">&nbsp;trip</span>
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1120px] flex-col px-5 pb-8">
        <h1 className="mb-5 mt-2 text-3xl font-extrabold">Your trips</h1>
        {error && <p className="rounded-xl bg-white p-4 text-body">{error}</p>}
        {trips && trips.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-body">
            No trips yet. Start one with New trip.
          </p>
        )}
        {trips && trips.length > 0 && (
          <TripList
            trips={trips}
            actions={(t) =>
              t.eraseOn ? (
                // Deleted: hidden from everyone until it's erased; its owner can put it back.
                <button type="button" onClick={() => restore(t)} className={rowButton(true)}>
                  Restore
                </button>
              ) : (
                <>
                  <Link to={`/organize/${t.id}/control`} className={`${rowButton(true)} gap-2`}>
                    Control panel
                    {/* What needs you on this trip, as its Actions counts it. */}
                    {Boolean(t.actionCount) && (
                      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
                        {t.actionCount}
                        <span className="sr-only"> to do</span>
                      </span>
                    )}
                  </Link>
                  <Link to={`/organize/${t.id}`} className={rowButton()}>
                    Edit
                  </Link>
                  <Link to={`/organize/${t.id}/people`} className={rowButton()}>
                    People
                  </Link>
                  {t.published && (
                    <Link to={`/t/${t.slug}`} className={rowButton()}>
                      Guest page
                    </Link>
                  )}
                </>
              )
            }
          />
        )}
      </main>
    </div>
  )
}
