import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CircleDollarSign,
  Link2,
  Plus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'
import { SampleTripBadge } from '@/components/SampleTripBadge'
import { SampleTripCards } from '@/components/SampleTripCards'
import { SiteFooter } from '@/components/SiteFooter'
import { useSignedIn } from '@/lib/auth'
import { FAQ } from '@/lib/faq'

// The marketing page at /. The organizer's trip list lives at /organize.
const DEMO_SLUG = 'tulum-40th-2027'

const STEPS = [
  {
    icon: Link2,
    title: 'Build the trip page',
    body: 'Photos, dates and the price, on one link you drop in the group chat.',
  },
  {
    icon: Users,
    title: 'Friends ask to join',
    body: 'One quick form and a signature. You pick who’s in.',
  },
  {
    icon: CircleDollarSign,
    title: 'They pay you',
    body: 'Deposit, then installments, straight to you. You check them off, and each guest sees what’s left.',
  },
]

const CHAT = [
  { who: 'Dana', text: 'wait what day do we fly??' },
  { who: 'You', text: 'Scroll up to the top, I just mentioned this yesterday' },
  { who: 'Marcus', text: "What's the details about the house" },
  { who: 'You', text: '🙄' },
  { who: 'Andre', text: 'scrolled up 300 messages, still lost' },
]

export function HomePage() {
  const signedIn = useSignedIn()

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          {!signedIn && (
            <Link
              to="/organize"
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl px-2 text-[15px] font-semibold text-royal hover:text-royal-dark sm:px-3"
            >
              Your trips
            </Link>
          )}
          <Link
            to="/organize/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-royal px-3 text-[15px] font-semibold text-white hover:bg-royal-dark sm:px-4"
          >
            <Plus className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            Add trip
          </Link>
          <AccountMenu />
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-14">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full bg-marigold px-3 py-1 text-sm font-semibold text-ink">
            For the friend who plans the trip
          </span>
          <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Get your trip out the group chat.
          </h1>
          <p className="max-w-[34rem] text-lg text-body">
            One link for the plan. One list of who&apos;s actually coming. Your crew stops asking,
            you stop answering.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/organize/new"
              className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-royal px-6 text-lg font-semibold text-white hover:bg-royal-dark"
            >
              Start a trip
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              to={`/t/${DEMO_SLUG}`}
              className="inline-flex min-h-[52px] items-center rounded-xl border-2 border-royal px-6 text-lg font-semibold text-royal hover:bg-royal-pale"
            >
              See a demo trip
            </Link>
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* The group chat problem */}
      <section className="bg-white py-16">
        <div className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 md:grid-cols-2">
          <div className="flex flex-col gap-3" aria-label="A typical group chat">
            {CHAT.map((m) => (
              <div
                key={m.text}
                className={`flex max-w-[85%] flex-col rounded-2xl px-4 py-2.5 ${
                  m.who === 'You'
                    ? 'self-end rounded-br-md bg-royal text-white'
                    : 'rounded-bl-md bg-ground'
                }`}
              >
                <span
                  className={`text-xs font-semibold ${m.who === 'You' ? 'text-white/70' : 'text-muted'}`}
                >
                  {m.who}
                </span>
                <span className="text-[17px]">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-4xl font-extrabold leading-tight">Sound familiar?</h2>
            <p className="text-lg text-body">
              Every group trip has one person holding it together with a spreadsheet, their memory
              and a 300-message thread. Travel HQ puts the plan, who&apos;s in and who&apos;s paid
              on one link, so the same questions get answered once, for everyone.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1120px] px-5 py-16">
        <h2 className="text-4xl font-extrabold">How a trip runs</h2>
        <p className="mt-2 text-lg text-body">They ask. You say yes. They pay you. Done.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-royal-pale text-royal">
                  <s.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="font-display text-sm font-extrabold text-muted">STEP {i + 1}</span>
              </div>
              <h3 className="text-xl font-extrabold">{s.title}</h3>
              <p className="text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The money rule */}
      <section className="bg-ink py-16 text-white">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-4xl font-extrabold leading-tight">
              Your crew pays you, like they always have.
              <br />
              <span className="text-marigold">We just handle the bookkeeping.</span>
            </h2>
            <p className="text-lg text-white/80">
              Your crew pays you directly, the way they already do. Travel HQ records it, shows each
              guest their balance, and keeps the plan straight.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {[
              'No processor fees, ever',
              'Zelle, Cash App, Venmo or cash',
              'Nothing to connect to your bank',
            ].map((t) => (
              <li
                key={t}
                className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-lg"
              >
                <BadgeCheck className="h-6 w-6 shrink-0 text-marigold" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Real trip pages */}
      <SampleTripCards>
        <h2 className="text-4xl font-extrabold">One page, any kind of trip</h2>
        <p className="mt-2 text-lg text-body">
          A beach house, a resort or a birthday villa. Tap one to see what your crew sees.
        </p>
      </SampleTripCards>

      {/* Questions */}
      <section className="mx-auto max-w-[1120px] px-5 py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-4xl font-extrabold">Questions organizers ask</h2>
          <Link
            to="/faq"
            className="py-2 text-[15px] font-semibold text-royal hover:text-royal-dark"
          >
            All questions
          </Link>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          {FAQ.slice(0, 3).map((f) => (
            <div key={f.q} className="rounded-2xl bg-white p-6 shadow-card">
              <dt className="text-lg font-extrabold">{f.q}</dt>
              <dd className="mt-2 text-body">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-[1120px] px-5 pb-16">
        <div className="flex flex-col items-start gap-5 rounded-[28px] bg-royal px-8 py-12 text-white sm:items-center sm:text-center">
          <h2 className="max-w-[44rem] text-4xl font-extrabold leading-tight">
            Plan the trip, without the spreadsheets, the text threads, or the million questions.
          </h2>
          <Link
            to="/organize/new"
            className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-marigold px-6 text-lg font-semibold text-ink hover:brightness-95"
          >
            Start a trip
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

/** The demo trip's cover with a few floating cards that show what the organizer gets. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[480px] pb-10 pr-4 sm:pr-8">
      <div className="relative overflow-hidden rounded-[24px] bg-white shadow-[0_20px_50px_rgba(15,28,46,0.18)]">
        <SampleTripBadge className="absolute right-3 top-3 z-10" />
        <img
          src="https://images.unsplash.com/photo-1713878620264-727e6fc497d8?auto=format&fit=crop&w=1000&q=80"
          alt="A villa pool in Tulum"
          className="h-56 w-full object-cover sm:h-64"
        />
        <div className="flex flex-col gap-2 bg-ink p-5 text-white">
          <span className="w-fit rounded-full bg-marigold px-2.5 py-0.5 text-xs font-semibold text-ink">
            Hosted by Simone
          </span>
          <span className="font-display text-2xl font-extrabold">Simone&apos;s 40th in Tulum</span>
          <span className="text-sm text-white/75">Tulum, Mexico · February 11–15, 2027</span>
        </div>
      </div>
      <div className="absolute -left-2 top-6 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-card sm:-left-8">
        <Users className="h-4 w-4 text-royal" aria-hidden="true" />7 going · 2 joining
      </div>
      <div className="absolute bottom-0 right-0 flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-card">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-royal-pale text-royal">
          <CalendarCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-xs text-muted">Next installment</span>
          <span className="font-semibold">$400 due Nov 15</span>
        </span>
      </div>
    </div>
  )
}
