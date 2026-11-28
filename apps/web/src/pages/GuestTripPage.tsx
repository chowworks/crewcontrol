import { useUser } from '@clerk/clerk-react'
import type { JoinView, PublicTrip } from '@cc/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GuestFloorPlan } from '@/components/SharedFloorPlan'
import { TripView } from '@/components/TripView'
import { ApiError, api } from '@/lib/api'
import { AnnouncementsSection } from './GuestAnnouncements'
import { ChangeRequestsSection } from './GuestChangeRequests'
import { InterestTile } from './GuestInterest'
import { QuestionsSection } from './GuestQuestions'
import { hasJoined, MyTripPanel } from './JoinPage'
import { NotFoundPage } from './NotFoundPage'
import { OrganizerRoom } from './OrganizerRoom'

export function GuestTripPage() {
  const { slug = '' } = useParams()
  const [trip, setTrip] = useState<PublicTrip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isSignedIn, user } = useUser()
  const userId = user?.id
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
    setView(null)
    if (!isSignedIn) return
    let live = true
    api
      .getJoin(slug)
      .then((v) => live && setView(v))
      .catch(() => {})
    return () => {
      live = false
    }
    // Switching accounts in the same tab reads the new person's place (and sections) afresh.
  }, [slug, isSignedIn, userId])

  if (error === 'not-found')
    return (
      <NotFoundPage message="This trip doesn't exist, or the organizer hasn't published it yet." />
    )
  if (error) return <NotFoundPage message={error} />
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />
  const mine = view && hasJoined(view) && !view.claimable
  // An organizer going on their own trip picks their room here (owner's decision, 2026-11-28).
  const me = view?.me
  const organizerGoing = mine && me?.organizerTripId && me.status === 'approved' ? me : null
  return (
    <TripView
      trip={trip}
      // One button under Rooms for everyone; accepted guests see names when the organizer shared them (owner's
      // decision, 2026-11-28).
      floorPlan={
        mine && view.floorPlan ? (
          <GuestFloorPlan plan={view.floorPlan} />
        ) : trip.floorPlan ? (
          <GuestFloorPlan plan={trip.floorPlan} anonymous />
        ) : undefined
      }
      myRoom={
        view && organizerGoing ? (
          <OrganizerRoom
            view={{ ...view, trip, me: organizerGoing }}
            // The rooms' places and the organizer's own part follow the move.
            onSaved={() => {
              api.getPublicTrip(slug).then(setTrip, () => {})
              api.getJoin(slug).then(setView, () => {})
            }}
          />
        ) : undefined
      }
      mine={
        mine
          ? {
              place: (
                <>
                  <MyTripPanel view={view} onChange={setView} />
                  {/* Accepted guests ask the organizers for a change here (issue #82). */}
                  <ChangeRequestsSection slug={slug} organizer={trip.organizerName} />
                </>
              ),
              announcements: <AnnouncementsSection slug={slug} />,
            }
          : undefined
      }
      // An accepted guest sees every section, those for accepted guests only included (issue #85).
      sections={view?.sections ?? trip.sections}
      questions={<QuestionsSection trip={trip} />}
      interest={<InterestTile trip={trip} />}
    />
  )
}
