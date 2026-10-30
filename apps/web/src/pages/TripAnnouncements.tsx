import {
  ANNOUNCEMENT_MAX,
  type AnnouncementAudience,
  type AnnouncementView,
  type OrganizerTrip,
  type TripAnnouncements,
} from '@cc/types'
import { Megaphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AnnouncementList } from '@/components/Announcements'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { IconCircle } from './TripGuests'

// Trip Control's Announcements (issue #12): the organizers post to the guests who joined, by email too if they like,
// and answer the replies under each post.

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

const AUDIENCE_NAMES: Record<AnnouncementAudience, string> = {
  accepted: 'Everyone on the trip',
  owing: 'Guests who still owe',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const failed = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback

/** Reloaded whenever the trip changes, so a guest just accepted or paid up counts in the right group. */
export function AnnouncementsCard({ trip }: { trip: OrganizerTrip }) {
  const toast = useToast()
  const [data, setData] = useState<TripAnnouncements | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [removing, setRemoving] = useState<AnnouncementView | null>(null)
  useEffect(() => {
    api
      .getAnnouncements(trip.id)
      .then(setData)
      .catch(() => setError('Announcements could not be loaded.'))
  }, [trip])

  async function change(step: () => Promise<TripAnnouncements>, done: string): Promise<boolean> {
    try {
      setData(await step())
      setError(null)
      toast({ text: done })
      return true
    } catch (err) {
      setError(failed(err, 'That didn’t save. Try again.'))
      return false
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={Megaphone} />
          Announcements
        </h2>
        <button type="button" className={filled} onClick={() => setPosting(true)}>
          Post an announcement
        </button>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {data && data.announcements.length === 0 && (
        <p className="text-body">
          Nothing posted yet. Announcements show on each guest’s trip page, and guests reply under
          them.
        </p>
      )}
      {data && data.announcements.length > 0 && (
        <AnnouncementList
          posts={data.announcements}
          canReply
          canRemove={() => true}
          onReply={(p, body) =>
            change(() => api.replyAsOrganizer(trip.id, p.id, body), 'Reply posted.')
          }
          onRemoveReply={(p, r) =>
            void change(() => api.removeReplyAsOrganizer(trip.id, p.id, r.id), 'Reply removed.')
          }
          meta={(p) => (
            <p className="text-sm text-muted">
              {AUDIENCE_NAMES[p.audience]} · {plural(p.sentTo ?? 0, 'guest')}
              {p.emailedTo ? ` · emailed to ${p.emailedTo}` : ''}
            </p>
          )}
          actions={(p) => (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className={outlined}
                onClick={() =>
                  void change(
                    () => api.pinAnnouncement(trip.id, p.id, !p.pinned),
                    p.pinned ? 'Unpinned.' : 'Pinned to the top.'
                  )
                }
              >
                {p.pinned ? 'Unpin' : 'Pin to the top'}
              </button>
              <button type="button" className={outlined} onClick={() => setRemoving(p)}>
                Remove
              </button>
            </div>
          )}
        />
      )}
      {posting && data && (
        <PostDialog
          audiences={data.audiences}
          error={error}
          onClose={() => setPosting(false)}
          onPost={async (input) => {
            const n = data.audiences[input.audience].guests
            const ok = await change(
              () => api.postAnnouncement(trip.id, input),
              input.email ? `Posted and emailed to ${plural(n, 'guest')}.` : 'Posted.'
            )
            if (ok) setPosting(false)
            return ok
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this announcement?"
          confirmLabel="Remove announcement"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const p = removing
            setRemoving(null)
            void change(() => api.removeAnnouncement(trip.id, p.id), 'Announcement removed.')
          }}
        >
          <p>
            It and its {plural(removing.replies.length, 'reply', 'replies')} come off every guest’s
            trip page. Emails already sent stay sent.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

function PostDialog({
  audiences,
  error,
  onClose,
  onPost,
}: {
  audiences: TripAnnouncements['audiences']
  error: string | null
  onClose: () => void
  onPost: (input: {
    body: string
    audience: AnnouncementAudience
    email: boolean
    pinned: boolean
  }) => Promise<boolean>
}) {
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('accepted')
  const [email, setEmail] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [sending, setSending] = useState(false)
  const [tried, setTried] = useState(false)
  const group = audiences[audience]
  const problems = {
    body: body.trim() ? null : 'Write the announcement.',
    audience: group.guests > 0 ? null : 'Nobody is in that group yet.',
  }
  const ok = !problems.body && !problems.audience

  return (
    <Dialog title="Post an announcement" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setTried(true)
          if (!ok || sending) return
          setSending(true)
          await onPost({ body: body.trim(), audience, email, pinned })
          setSending(false)
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Message
          <textarea
            className="min-h-[140px] rounded-lg border border-[#5B6B80] bg-white px-3 py-2.5 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal"
            maxLength={ANNOUNCEMENT_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {tried && problems.body && (
            <span className="font-semibold text-[#B42318]">{problems.body}</span>
          )}
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-semibold">
          Who it’s for
          <Dropdown
            label="Who it’s for"
            value={audience}
            options={(Object.keys(AUDIENCE_NAMES) as AnnouncementAudience[]).map((a) => ({
              value: a,
              label: `${AUDIENCE_NAMES[a]} (${audiences[a].guests})`,
            }))}
            onChange={setAudience}
          />
          {problems.audience && (
            <span className="font-semibold text-[#B42318]">{problems.audience}</span>
          )}
        </div>
        <label
          className={`flex min-h-[44px] gap-3 text-sm font-semibold ${email && group.stopped > 0 ? 'items-start' : 'items-center'}`}
        >
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-royal"
          />
          <span>
            Email it to them too
            {email && group.stopped > 0 && (
              <span className="block font-normal text-muted">
                {plural(group.stopped, 'guest')} stopped updates and won’t get the email. Everyone
                sees it on their trip page.
              </span>
            )}
          </span>
        </label>
        <label className="flex min-h-[44px] items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-royal"
          />
          Pin it to the top
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={filled} disabled={sending}>
            {sending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
