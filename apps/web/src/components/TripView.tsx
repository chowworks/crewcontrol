import type { PublicTrip } from '@cc/types'
import { CalendarDays, MapPin } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { dateRange, installmentLine, money, shortDate } from '@/lib/format'
import { HighlightIcon } from './HighlightIcon'
import { Logo } from './Logo'
import { PhotoGallery } from './PhotoGallery'

const h2 = 'text-[26px] font-extrabold'

/** The guest-facing trip page. Also rendered as the organizer's live preview. */
export function TripView({ trip }: { trip: PublicTrip }) {
  const cover = trip.photos[0]
  const going = `${trip.goingCount} going · ${trip.interestedCount} interested`

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
      </header>

      <section className="mx-auto max-w-[1120px] px-5">
        <div className="overflow-hidden rounded-[20px] bg-placeholder">
          <div className="h-56 sm:h-80">
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
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-card">
            <div className="text-sm font-semibold text-muted">Cost per person</div>
            <div className="font-display text-[44px] font-extrabold leading-none">
              {money(trip.costPerPersonCents)}
            </div>
            <p className="text-[15px] text-body">
              {installmentLine(trip.costPerPersonCents, trip.installmentCount)} The first one
              reserves your spot once you&apos;re approved.
            </p>
            <p className="rounded-[10px] bg-royal-pale px-3 py-2.5 text-sm text-body">
              Nothing to pay today. {trip.organizerName} reviews who&apos;s interested, approves the
              crew, then shares how to pay.
            </p>
            <a
              href="#register"
              className="block rounded-xl bg-royal px-5 py-[15px] text-center text-[17px] font-semibold text-white hover:bg-royal-dark"
            >
              Register interest
            </a>
            <p className="text-center text-[13px] text-muted">
              Free to register. It doesn&apos;t commit you.
            </p>
          </div>
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

          <RegisterInterest organizerName={trip.organizerName} />
        </main>
      </div>

      <footer className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 px-5 pb-10 text-sm text-muted">
        <span>
          Planned with <strong className="text-ink">CrewControl</strong>
        </span>
        <span>Get your trip out the group chat.</span>
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

const input =
  'rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'

// Registration itself is slice 2. Until then the form explains rather than pretending to send.
function RegisterInterest({ organizerName }: { organizerName: string }) {
  const [notice, setNotice] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setNotice(true)
  }
  return (
    <section id="register" className="flex flex-col gap-4 rounded-2xl bg-white p-6">
      <div className="flex flex-col gap-1">
        <h2 className={h2}>Want in?</h2>
        <p className="text-muted">
          Register interest, {organizerName} approves you, then you pay the first installment to
          lock in your spot. Phone and email are both required so you don&apos;t miss trip updates.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5"
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Full name
          <input
            className={input}
            name="name"
            required
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Phone
          <input
            className={input}
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="(555) 555-0100"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Email
          <input
            className={input}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          className="min-h-[50px] self-end rounded-xl bg-royal px-5 py-3.5 text-[17px] font-semibold text-white hover:bg-royal-dark"
        >
          Count me in
        </button>
      </form>
      {notice && (
        <p role="status" className="rounded-[10px] bg-royal-pale px-3 py-2.5 text-sm text-body">
          Sign-ups aren&apos;t switched on for this trip yet. Message {organizerName} directly for
          now.
        </p>
      )}
    </section>
  )
}
