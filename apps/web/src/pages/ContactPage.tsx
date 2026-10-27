import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS, type ContactTopic } from '@cc/types'
import { CircleCheck } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/SiteFooter'
import { ApiError, api } from '@/lib/api'

const EMPTY = { name: '', email: '', topic: 'question' as ContactTopic, message: '', website: '' }

/** `?topic=` when it is one of CONTACT_TOPICS, else a general question. */
function topicFrom(params: URLSearchParams): ContactTopic {
  const topic = params.get('topic')
  return CONTACT_TOPICS.find((t) => t === topic) ?? 'question'
}

/** What went wrong, in plain words. The API's 400 already says what to fix. */
function problem(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400) return e.message
    if (e.status === 429)
      return 'Too many messages from here. Please wait a few minutes and try again.'
  }
  return "Your message didn't go through. Please try again."
}

/**
 * The public contact page, adapted from Audit Differently's. `?topic=` prefills the topic (the privacy page sends
 * `?topic=privacy`). `website` is a honeypot, out of sight and out of the tab order, so only a bot fills it in.
 */
export function ContactPage() {
  const [params] = useSearchParams()
  const initialTopic = topicFrom(params)
  // From the 404 page: the broken address, as a plain path only (never a query string), prefilled in the message.
  const page = params.get('page')
  const brokenLink =
    page && page.length <= 300 && /^\/[\w\-./]*$/.test(page)
      ? `The link ${page} didn't work.\n\n`
      : ''
  const [form, setForm] = useState({ ...EMPTY, topic: initialTopic, message: brokenLink })
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set =
    (key: keyof typeof EMPTY) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.sendContact(form)
      setSentTo(form.email)
      setForm({ ...EMPTY, topic: initialTopic })
    } catch (err) {
      setError(problem(err))
    } finally {
      setBusy(false)
    }
  }

  const input =
    'min-h-[48px] w-full rounded-xl border border-rule bg-white px-4 text-[16px] text-ink focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/30'

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[640px] items-center px-5 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-5 pb-12">
        <div>
          <h1 className="mt-4 text-4xl font-extrabold">Contact us</h1>
          <p className="mt-2 text-lg text-body">
            Questions about Travel HQ, help with a trip, or anything else: write here and we&apos;ll
            answer by email.
          </p>
        </div>

        {sentTo ? (
          <div
            role="status"
            className="flex flex-col items-start gap-3 rounded-2xl bg-white p-6 shadow-card"
          >
            <CircleCheck className="h-8 w-8 text-royal" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold">Message sent</h2>
            <p className="text-body">
              Thanks for writing. We&apos;ll reply to <strong className="text-ink">{sentTo}</strong>
              .
            </p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="relative flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-card"
          >
            {error && (
              <p role="alert" className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
                {error}
              </p>
            )}
            <label className="flex flex-col gap-1.5 font-semibold">
              Name
              <input
                className={input}
                value={form.name}
                onChange={set('name')}
                maxLength={120}
                autoComplete="name"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 font-semibold">
              Email
              <input
                className={input}
                type="email"
                value={form.email}
                onChange={set('email')}
                maxLength={254}
                autoComplete="email"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 font-semibold">
              Topic
              <select className={input} value={form.topic} onChange={set('topic')} required>
                {CONTACT_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {CONTACT_TOPIC_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 font-semibold">
              Message
              <textarea
                className={`${input} py-3`}
                rows={6}
                value={form.message}
                onChange={set('message')}
                maxLength={4000}
                required
              />
            </label>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-10000px',
                width: 1,
                height: 1,
                overflow: 'hidden',
              }}
            >
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set('website')}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[48px] items-center rounded-xl bg-royal px-6 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </form>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
