import { CHANGE_REQUEST_MAX, type MyChangeRequests } from '@cc/types'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { StatusTag } from './TripChangeRequests'

// "Request a trip change" on the trip page (issue #82; owner's decisions, 2026-11-15): a guest accepted on the trip asks
// the organizers for a change in their own words. Always private: only they and the organizers see it. Under their
// place on the trip, with the requests they asked and how each was answered.

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal bg-white px-4 text-[15px] font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-[15px] font-semibold text-white hover:bg-royal-dark disabled:opacity-60'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function ChangeRequestsSection({ slug, organizer }: { slug: string; organizer: string }) {
  const toast = useToast()
  const [data, setData] = useState<MyChangeRequests | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let live = true
    api
      .getMyChangeRequests(slug)
      .then((d) => live && setData(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [slug])

  if (!data || (!data.canAsk && data.requests.length === 0)) return null
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-extrabold">Trip changes</h2>
      <p className="text-[15px] text-body">
        Need something changed, like your room or your dates? Ask {organizer}. Only the organizers
        see it.
      </p>
      {data.canAsk && (
        <button type="button" className={`${outlined} self-start`} onClick={() => setAsking(true)}>
          Request a trip change
        </button>
      )}
      {data.requests.length > 0 && (
        <ul>
          {data.requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1.5 border-t border-rule py-3 text-[15px] first:border-t-0"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <StatusTag status={r.status} guest />
                Asked {day(r.createdAt)}
              </span>
              <span className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
                {r.request}
              </span>
              {r.reply && (
                <span className="whitespace-pre-wrap rounded-xl bg-royal-pale px-3 py-2 text-sm text-body [overflow-wrap:anywhere]">
                  {r.reply}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <RequestDialog
          slug={slug}
          organizer={organizer}
          onClose={() => setAsking(false)}
          onSent={(d) => {
            setData(d)
            setAsking(false)
            toast({ text: 'Request sent to the organizers.' })
          }}
        />
      )}
    </section>
  )
}

function RequestDialog({
  slug,
  organizer,
  onClose,
  onSent,
}: {
  slug: string
  organizer: string
  onClose: () => void
  onSent: (d: MyChangeRequests) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooLong = text.trim().length > CHANGE_REQUEST_MAX

  async function send() {
    if (!text.trim() || tooLong || sending) return
    setSending(true)
    try {
      onSent(await api.requestChange(slug, text.trim()))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t send. Try again.')
      setSending(false)
    }
  }

  return (
    <Dialog title="Request a trip change" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="change-request" className="font-semibold">
            Describe the change you’d like
          </label>
          <textarea
            id="change-request"
            rows={5}
            className="w-full resize-none rounded-lg border border-[#5B6B80] px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={tooLong ? 'change-request-long' : undefined}
          />
          {tooLong && (
            <p id="change-request-long" className="text-sm font-semibold text-[#B42318]">
              Keep it to {CHANGE_REQUEST_MAX.toLocaleString('en-US')} characters.
            </p>
          )}
        </div>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-body">
          Only {organizer} and the trip’s other organizers see it. We’ll email you when they answer.
          Nothing changes until they do.
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={filled} disabled={sending || !text.trim() || tooLong}>
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
