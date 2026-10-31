import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'

/*
 * The privacy page, adapted from Audit Differently's. Taken out of draft on 2026-10-31 (owner's decision), once every
 * promise on it was built. Keep it true to what the product does: a new promise here needs its feature built first,
 * and any change to what it says moves LAST_UPDATED.
 */
const LAST_UPDATED = 'October 31, 2026'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[760px] items-center px-5 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 pb-12">
        <h1 className="mt-4 text-4xl font-extrabold">Privacy and Data Protection</h1>
        <p className="text-sm text-muted">Last updated {LAST_UPDATED}</p>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-body">
          Travel HQ is in a limited preview, so what it does, and this page, may change. When it
          does, we&apos;ll update this page and the date above.
        </p>

        <Section title="Our approach">
          <p>
            Travel HQ exists to get a group trip out of the group chat, not to collect data. We keep
            what an organizer needs to run the trip, show each person only what they need to see,
            and never sell any of it.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5">
            <li>
              <strong>Organizers:</strong> your name, email and sign-in details, and the trips you
              run: dates, cost, highlights, key dates, photos, rooms, payment instructions, vendor
              costs, announcements, answers to guests&apos; questions and your trip settings, plus
              the emails of anyone you add to help run a trip.
            </li>
            <li>
              <strong>Guests:</strong> your sign-in details, the name, phone number and email you
              give when you join a trip (or give for someone you sign up), the room you pick and who
              you&apos;d like to share with, whether the organizer has accepted you, the questions
              and replies you post, the emails and reminders the trip sends you, and whether an
              email to you bounced.
            </li>
            <li>
              <strong>Trip agreements:</strong> the agreement you signed, exactly as you saw it,
              with the name you typed, when you signed, and the internet address and browser you
              signed from, so it can be shown later what you agreed to.
            </li>
            <li>
              <strong>Terms you accepted:</strong> which version of Travel HQ&apos;s Terms of Use
              (and, for organizers, the Organizer Terms) you accepted, when, and the internet
              address and browser you accepted them from.
            </li>
            <li>
              <strong>Refused joins:</strong> if you try to join a trip with an email that
              can&apos;t be used, what you typed, your account, and the internet address and browser
              you used, shown to that trip&apos;s organizers.
            </li>
            <li>
              <strong>Payment records:</strong> what the organizer logs about who paid, how much,
              when and how (for example &ldquo;Zelle, $300, March 1&rdquo;), and each guest&apos;s
              plan and balance, with any credits or charges and their reasons.
            </li>
            <li>
              <strong>Forwarded receipts:</strong> if an organizer forwards a payment email to their
              trip&apos;s receipts address, who sent it, its subject, the amount, the payer&apos;s
              name and a short excerpt, so the payment can be matched to a guest.
            </li>
            <li>
              <strong>Early access and contact:</strong> the name, email and note you leave when you
              ask for early access, and what you write in our contact form, which comes to us by
              email.
            </li>
            <li>
              <strong>Visits:</strong> anonymous page-view counts (which pages, roughly where from,
              what kind of device), without advertising cookies. Sign-in uses cookies to keep you
              signed in.
            </li>
          </ul>
          <p>
            We never collect card numbers or bank logins. Travel HQ doesn&apos;t process, move or
            hold money: guests pay the organizer directly, and we keep the record.
          </p>
        </Section>

        <Section title="Who sees it">
          <ul className="list-disc pl-5">
            <li>
              <strong>A trip&apos;s owners and organizers</strong> see its guest list, contact
              details, signed agreements and payment records, and no other trip&apos;s.
            </li>
            <li>
              <strong>Each guest</strong> sees the trip page and, once they join, their own signed
              agreement, plan, payments and balance, and the organizer&apos;s name and email. Guests
              never see each other&apos;s phone numbers, emails or balances. A reply you post under
              an announcement shows as your first name and last initial to the guests it went to.
            </li>
            <li>
              <strong>The public trip page</strong> shows the organizer&apos;s name, and never shows
              guests&apos; phone numbers, emails or money owed, or who asked a question. If the
              organizer turns on &ldquo;who&apos;s going&rdquo;, or lets guests pick rooms (so they
              can choose who to share with), it shows accepted guests by first name and last
              initial.
            </li>
            <li>
              <strong>Travel HQ&apos;s admins</strong> can open any trip to support it and keep the
              service running, and read early access requests.
            </li>
            <li>
              <strong>Our service providers</strong> handle data only to run Travel HQ for us:
              Railway (servers and database), Vercel (the website and visit counts), Cloudflare
              (photos), Clerk (sign-in, including with Google or Microsoft if you choose) and Resend
              (email). Fonts load from Google Fonts, and the status notice from Better Stack.
            </li>
          </ul>
        </Section>

        <Section title="Messages to your crew">
          <p>
            Reminders and announcements go to guests only because their organizer set them up for
            that trip. We don&apos;t send marketing to guests, and we don&apos;t share their contact
            details with anyone for marketing. Guests can stop reminders and announcement emails for
            a trip at any time from the link in those emails; emails about their own place on the
            trip, such as being accepted, still come.
          </p>
        </Section>

        <Section title="How it's protected">
          <ul className="list-disc pl-5">
            <li>
              Data is encrypted in transit (HTTPS), and photos and database backups are encrypted at
              rest.
            </li>
            <li>
              Organizers and guests sign in. The database itself keeps each trip to its owners and
              organizers, and each guest to their own records.
            </li>
            <li>Only people who need access to run the service have it.</li>
            <li>
              We keep only what a trip needs, and a trip&apos;s owner can delete it when
              they&apos;re done.
            </li>
          </ul>
          <p>
            No method of storing or sending data over the internet is 100% secure. If something goes
            wrong that affects your data, we&apos;ll tell you.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            A trip&apos;s owner can delete it, and with it the trip&apos;s guest list and payment
            records, whenever they choose. Travel HQ has them download everything on the trip first,
            and emails each guest who signed their own signed agreement and payments. A deleted trip
            is hidden at once and erased for good 30 days later; until then its owner can restore
            it. Organizers are responsible for keeping their own copies of anything they need.
          </p>
          <p>
            A forwarded receipt that reaches no trip, or that the organizer dismisses, is erased
            after 30 days. To have your account and what it holds deleted, use our contact form.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can ask to see, correct or delete the personal data we hold about you, or object to
            how we use it. Use{' '}
            <Link
              to="/contact?topic=privacy"
              className="font-semibold text-royal hover:text-royal-dark"
            >
              our contact form
            </Link>{' '}
            and we&apos;ll take care of it. Guests can also ask their trip&apos;s organizer.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data or this page:{' '}
            <Link
              to="/contact?topic=privacy"
              className="font-semibold text-royal hover:text-royal-dark"
            >
              our contact form
            </Link>
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 text-body shadow-card">
      <h2 className="text-xl font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  )
}
