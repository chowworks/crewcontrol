import { useUser } from '@clerk/clerk-react'
import type { JoinView, PublicTrip } from '@cc/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TripView } from '@/components/TripView'
import { ApiError, api } from '@/lib/api'
import { AnnouncementsSection } from './GuestAnnouncements'
import { hasJoined, MyTripPanel } from './JoinPage'
import { NotFoundPage } from './NotFoundPage'

export function GuestTripPage() {
  const { slug = '' } = useParams()
  const [trip, setTrip] = useState<PublicTrip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isSignedIn } = useUser()
  // Someone on the trip sees their place here, with what the organizers posted (owner's decision, 2026-10-29).
  const [view, setView] = useState<JoinView | null>(null)

  useEffect(() => {
    api
      .getPublicTrip(slug)
      .then((t) => {
        setTrip(t)
        document.title = `${t.name} · Travel HQ`
      })
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'not-found'
            : 'This trip could not be loaded.'
        )
      )
  }, [slug])

  useEffect(() => {
    if (!isSignedIn) return setView(null)
    let live = true
    api
      .getJoin(slug)
      .then((v) => live && setView(v))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [slug, isSignedIn])

  if (error === 'not-found')
    return (
      <NotFoundPage message="This trip doesn't exist, or the organizer hasn't published it yet." />
    )
  if (error) return <NotFoundPage message={error} />
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />
  const mine = view && hasJoined(view) && !view.claimable
  return (
    <TripView
      trip={trip}
      mine={
        mine
          ? {
              place: <MyTripPanel view={view} onChange={setView} />,
              announcements: <AnnouncementsSection slug={slug} />,
            }
          : undefined
      }
    />
  )
}
