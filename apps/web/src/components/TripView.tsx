import { roomsPricedApart, type PublicTrip } from '@cc/types'
import { RoomCard } from '@/components/RoomCard'
import { CalendarDays, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { defaultSignupNote } from '@/lib/signups'
import { dateRange, installmentLine, money, shortDate } from '@/lib/format'
import { HighlightIcon } from './HighlightIcon'
import { Logo } from './Logo'
import { PhotoGallery } from './PhotoGallery'
import { SampleTripBadge } from './SampleTripBadge'

const h2 = 'text-[26px] font-extrabold'

/** The guest-facing trip page. Also rendered as the organizer's live preview. */
export function TripView({ trip, preview = false }: { trip: PublicTrip; preview?: boolean }) {
  const cover = trip.photos[0]
  const going = `${trip.goingCount} going · ${trip.interestedCount} joining`
  // A full trip keeps taking sign-ups onto its waitlist, where nobody is asked to send money.
  const full = trip.waitlisting
  // Rooms priced apart (issue #30): the trip shows its cheapest room's price, "From $X".
  const apart = roomsPricedApart(trip.rooms, trip.costPerPersonCents)
  const cheapest = apart
    ? [...trip.rooms].sort((a, b) => a.priceCents - b.priceCents)[0]
    : undefined
  // A deposit: the organizer set a first payment different from the rest ("Deposit first").
  const plan = cheapest?.paymentPlan ?? trip.paymentPlan
  const deposit = plan.length > 1 && plan[0].amountCents !== plan[1].amountCents
  const keptDeposit = deposit && trip.refundPolicy === 'first_payment_kept'

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
      </header>

      <section className="mx-auto max-w-[1120px] px-5">
        <div className="overflow-hidden rounded-[20px] bg-placeholder">
          <div className="relative h-56 sm:h-80">
            {trip.isSample && <SampleTripBadge className="absolute left-4 top-4 z-10" />}
            {cover && (
              <img
                src={cover.url}
                alt={cover.caption || trip.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-2.5 bg-ink p-7 text-white">
            <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
              <span className="rounded-full bg-marigold px-2.5 py-1 text-ink">
                Hosted by {trip.organizerName}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-ink">{going}</span>
            </div>
            <h1 className="text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.02] tracking-tight">
              {trip.name}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[#DCE6EC]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
                {trip.destination}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />
                {dateRange(trip.startDate, trip.endDate)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1120px] flex-row-reverse flex-wrap items-start gap-7 px-5 pb-12 pt-7">
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-4">
          <div className="flex flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-card">
            <div className="text-sm font-semibold text-muted">Cost per person</div>
            <div className="font-display text-[44px] font-extrabold leading-none">
              {apart && <span className="text-2xl">From </span>}
              {money(cheapest?.priceCents ?? trip.costPerPersonCents)}
            </div>
            <p className="text-[15px] text-body">
              {apart && 'Each room has its own price; you pick yours when you join. '}
              {installmentLine(plan)}
              {trip.joinMode === 'accept_first'
                ? ' You pay once you’re accepted.'
                : deposit
                  ? ` Your deposit saves your spot${keptDeposit ? ' and isn’t refundable' : ''}.`
                  : ' Your first payment saves your spot.'}
            </p>
            <p className="rounded-[10px] bg-royal-pale px-3 py-2.5 text-sm text-body">
              {trip.joinMode === 'first_come'
                ? `Sign the trip agreement and pay ${trip.organizerName}. Spots go first come, first served, in the order payments are confirmed. If the trip fills first, ${trip.organizerName} refunds you in full.`
                : trip.joinMode === 'pay_first'
                  ? `Sign the trip agreement and pay ${trip.organizerName}, who then accepts the crew. If you’re not accepted, ${trip.organizerName} refunds you in full.`
                  : `Sign the trip agreement, and ${trip.organizerName} accepts the crew. Once you’re accepted, you’ll see how to pay.`}
            </p>
          </div>
          <WantInTile trip={trip} preview={preview} full={full} />
        </aside>

        <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
          {trip.description && (
            <section className="flex flex-col gap-2.5">
              <h2 className={h2}>The trip</h2>
              <p className="max-w-[62ch] whitespace-pre-line text-[17px] text-body">
                {trip.description}
              </p>
            </section>
          )}

          {trip.photos.length > 1 && (
            <PhotoGallery title={trip.galleryTitle} photos={trip.photos} />
          )}

          {trip.highlights.length > 0 && (
            <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              {trip.highlights.map((h, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-[14px] bg-white p-[18px]">
                  <HighlightIcon icon={h.icon} className="h-6 w-6 text-royal" />
                  <div className="font-semibold">{h.title}</div>
                  {h.detail && <div className="text-sm text-muted">{h.detail}</div>}
                </div>
              ))}
            </section>
          )}

          {trip.options.roomChoice && trip.rooms.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className={h2}>Rooms</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                {trip.rooms.map((r) => (
                  <RoomCard key={r.id} room={r} price={apart ? r.priceCents : undefined} />
                ))}
              </div>
              <p className="text-sm text-muted">You pick your room when you join.</p>
            </section>
          )}

          {trip.guestNames && trip.guestNames.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className={h2}>Who&apos;s going</h2>
              <ul className="flex flex-wrap gap-2.5">
                {trip.guestNames.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3.5"
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-royal-pale text-[13px] font-semibold text-royal"
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className="text-[15px] font-medium">{name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trip.keyDates.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className={h2}>Key dates</h2>
              <ol className="rounded-[14px] bg-white">
                {trip.keyDates.map((d, i) => (
                  <li
                    key={i}
                    className="flex gap-4 border-b border-rule px-[18px] py-4 last:border-b-0"
                  >
                    <span className="w-[84px] shrink-0 font-semibold text-royal">
                      {shortDate(d.date)}
                    </span>
                    <span>{d.label}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </main>
      </div>

      <footer className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 px-5 pb-10 text-sm text-muted">
        <span>
          Planned with <strong className="text-ink">Travel HQ</strong>
        </span>
        <span className="flex gap-4">
          <Link to="/privacy" className="font-semibold hover:text-royal">
            Privacy
          </Link>
          <span>Get your trip out the group chat.</span>
        </span>
      </footer>
    </div>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .replace('.', '')
}

/**
 * "I want to join": opens the join page, where guests sign in, sign the agreement and see how to pay. Inert in the
 * organizer's preview. On a full trip it leads to the waitlist, and back to their place for guests who joined.
 */
function JoinLink({
  trip,
  preview,
  full,
  className,
  children,
}: {
  trip: PublicTrip
  preview: boolean
  full: boolean
  className: string
  children: ReactNode
}) {
  if (preview)
    return (
      <span aria-disabled="true" title="Guests open the join page from here" className={className}>
        {children}
      </span>
    )
  return (
    <Link to={`/t/${trip.slug}/join`} className={className}>
      {full ? 'Join the waitlist' : children}
    </Link>
  )
}

/** The right-hand tile that invites people in and opens the join page. */
function WantInTile({
  trip,
  preview,
  full,
}: {
  trip: PublicTrip
  preview: boolean
  full: boolean
}) {
  const spotsLeft = trip.maxGuests ? Math.max(0, trip.maxGuests - trip.spotsTaken) : null
  const faces = (trip.guestNames ?? []).slice(0, 4)
  return (
    <div className="relative overflow-hidden rounded-2xl bg-royal p-6 text-white shadow-card">
      <svg
        viewBox="0 0 200 120"
        className="pointer-events-none absolute -right-4 -top-3 h-20 w-auto opacity-90"
        aria-hidden="true"
      >
        <path
          d="M108 22H70a22 22 0 0 0-22 22v30a22 22 0 0 0 22 22h8v20l26-20h28a22 22 0 0 0 22-22v-8"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g transform="translate(112 0) scale(2.1)">
          <path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D" />
          <path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22" />
        </g>
      </svg>
      <div className="relative flex flex-col gap-3">
        <h2 className="font-display text-[28px] font-extrabold leading-tight">
          {full ? 'Join the waitlist' : 'Want in?'}
        </h2>
        <p className="max-w-[22ch] whitespace-pre-line text-[15px] text-white/85">
          {full
            ? `Every spot is spoken for. Join the waitlist and ${trip.organizerName} will text you if one opens. You pay nothing until then.`
            : trip.options.signupNote.trim() ||
              defaultSignupNote(trip.organizerName, trip.joinMode)}
        </p>
        {(faces.length > 0 || spotsLeft !== null) && (
          <div className="flex items-center gap-3">
            {faces.length > 0 && (
              <span className="flex">
                {faces.map((n, i) => (
                  <span
                    key={n + i}
                    className="-ml-2 grid h-9 w-9 place-items-center rounded-full border-2 border-royal bg-marigold text-xs font-bold text-ink first:ml-0"
                  >
                    {initials(n)}
                  </span>
                ))}
              </span>
            )}
            <span className="text-sm font-semibold">
              {spotsLeft !== null
                ? `${spotsLeft} of ${trip.maxGuests} spots left`
                : `${trip.goingCount} going`}
            </span>
          </div>
        )}
        <JoinLink
          trip={trip}
          preview={preview}
          full={full}
          className="mt-1 flex min-h-[50px] items-center justify-center rounded-xl bg-marigold px-5 text-[17px] font-semibold text-ink hover:brightness-95"
        >
          I want to join
        </JoinLink>
      </div>
    </div>
  )
}
