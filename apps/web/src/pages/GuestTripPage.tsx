import type { PublicTrip } from '@cc/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TripView } from '@/components/TripView'
import { ApiError, api } from '@/lib/api'
import { NotFoundPage } from './NotFoundPage'

export function GuestTripPage() {
  const { slug = '' } = useParams()
  const [trip, setTrip] = useState<PublicTrip | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getPublicTrip(slug)
      .then((t) => {
        setTrip(t)
        document.title = `${t.name} · CrewControl`
      })
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'not-found'
            : 'This trip could not be loaded.'
        )
      )
  }, [slug])

  if (error === 'not-found')
    return (
      <NotFoundPage message="This trip doesn't exist, or the organizer hasn't published it yet." />
    )
  if (error) return <NotFoundPage message={error} />
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />
  return <TripView trip={trip} />
}
