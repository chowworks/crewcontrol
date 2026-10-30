import { QUESTION_MAX, type FaqEntry, type MyQuestion, type PublicTrip } from '@cc/types'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { useSignedIn } from '@/lib/auth'

// The trip page's Questions (issue #13): the answers for everyone, each folded under its question, and for the
// signed-in person their own private answers and the questions still waiting. Last on the page, after Key dates,
// for everyone (owner's decisions, 2026-10-30).

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal bg-white px-4 text-[15px] font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-[15px] font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const tag = 'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide'

export function QuestionsSection({ trip }: { trip: PublicTrip }) {
  const signedIn = useSignedIn()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [mine, setMine] = useState<MyQuestion[]>([])
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!signedIn) return setMine([])
    let live = true
    api
      .getMyQuestions(trip.slug)
      .then((q) => live && setMine(q))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [trip.slug, signedIn])

  // Back from signing in to ask: the dialog opens by itself.
  useEffect(() => {
    if (!signedIn || params.get('ask') !== '1') return
    setAsking(true)
    params.delete('ask')
    setParams(params, { replace: true })
  }, [signedIn, params, setParams])

  function ask() {
    if (signedIn) return setAsking(true)
    const back = `${window.location.origin}/t/${trip.slug}?ask=1`
    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`)
  }

  const answeredForMe = mine.filter((q) => q.status === 'private')
  const waiting = mine.filter((q) => q.status === 'waiting')
  const empty = trip.faq.length === 0 && answeredForMe.length === 0 && waiting.length === 0

  return (
    // Laid out like Key dates above it: a heading, then the list on white.
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[26px] font-extrabold">Questions</h2>
        <button type="button" className={outlined} onClick={ask}>
          Ask a question
        </button>
      </div>
      {empty ? (
        <p className="text-[17px] text-body">
          Nothing asked yet. Ask the organizers anything about the trip.
        </p>
      ) : (
        <div className="rounded-[14px] bg-white px-[18px] py-1">
          {trip.faq.map((f) => (
            <Entry key={f.id} entry={f} />
          ))}
          {answeredForMe.map((q) => (
            <Entry
              key={q.id}
              entry={{ id: q.id, question: q.question, answer: q.answer ?? '' }}
              mine
            />
          ))}
          {waiting.map((q) => (
            <div
              key={q.id}
              className="flex flex-col gap-1.5 border-t border-rule py-3 text-[15px] text-body first:border-t-0"
            >
              <span className={`${tag} self-start bg-[#FDF1D8] text-[#6B4A0B]`}>
                Waiting for an answer
              </span>
              <span className="[overflow-wrap:anywhere]">You asked: {q.question}</span>
            </div>
          ))}
        </div>
      )}
      {asking && (
        <AskDialog
          trip={trip}
          onClose={() => setAsking(false)}
          onAsked={(q) => {
            setMine(q)
            setAsking(false)
            toast({ text: 'Question sent to the organizers.' })
          }}
        />
      )}
    </section>
  )
}

/** A question with its answer folded under it; the caller's own private answer says so. */
function Entry({ entry, mine = false }: { entry: FaqEntry; mine?: boolean }) {
  return (
    <details className="group border-t border-rule py-2 first:border-t-0">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-base font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col items-start gap-1 [overflow-wrap:anywhere]">
          {mine && <span className={`${tag} bg-royal-pale text-royal`}>Private</span>}
          {entry.question}
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-royal transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="mb-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-body [overflow-wrap:anywhere]">
        {entry.answer}
      </p>
      {mine && <p className="mb-1.5 text-sm text-muted">Only you see this answer.</p>}
    </details>
  )
}

function AskDialog({
  trip,
  onClose,
  onAsked,
}: {
  trip: PublicTrip
  onClose: () => void
  onAsked: (mine: MyQuestion[]) => void
}) {
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooLong = question.trim().length > QUESTION_MAX

  async function send() {
    if (!question.trim() || tooLong || sending) return
    setSending(true)
    try {
      onAsked(await api.askQuestion(trip.slug, question.trim()))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t send. Try again.')
      setSending(false)
    }
  }

  return (
    <Dialog title="Ask the organizers a question" onClose={onClose}>
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
        <p className="text-body">
          The trip’s organizers get it by email and answer here. We’ll email you the answer.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ask-question" className="font-semibold">
            Your question
          </label>
          <textarea
            id="ask-question"
            rows={4}
            className="w-full resize-none rounded-lg border border-[#5B6B80] px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-describedby={tooLong ? 'ask-question-long' : undefined}
          />
          {tooLong && (
            <p id="ask-question-long" className="text-sm font-semibold text-[#B42318]">
              Keep it to {QUESTION_MAX} characters.
            </p>
          )}
        </div>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-body">
          They may add the answer to the trip’s questions for everyone. Your name is never shown
          with it.
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={filled}
            disabled={sending || !question.trim() || tooLong}
          >
            {sending ? 'Sending…' : 'Send question'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
