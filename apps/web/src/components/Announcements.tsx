import { REPLY_MAX, type AnnouncementReplyView, type AnnouncementView } from '@cc/types'
import { Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

// The posts and the replies under them (issue #12), as Trip Control and the join page both show them. Long lists
// fold: the newest posts and the last replies show, with a button for the rest (owner's decision, 2026-10-29).

/** Posts shown before "Show earlier announcements", besides the pinned ones. */
const POSTS_SHOWN = 3
/** Replies shown under a post before "Show earlier replies". */
const REPLIES_SHOWN = 2

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
/** The two looks: on a white card (Trip Control), and on the trip page's dark purple box for guests. */
const LIGHT = {
  outlined,
  filled,
  muted: 'text-muted',
  tag: 'bg-royal-pale text-royal',
  rule: 'border-rule',
  bin: 'text-muted hover:bg-royal-pale hover:text-royal',
}
const DARK: typeof LIGHT = {
  outlined:
    'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/70 px-3 text-sm font-semibold text-white hover:bg-white/10',
  // Marigold is the main action on royal (CLAUDE.md "Design rules").
  filled:
    'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-marigold px-3 text-sm font-semibold text-ink hover:brightness-95 disabled:opacity-60',
  muted: 'text-white/75',
  tag: 'bg-white/15 text-white',
  rule: 'border-white/20',
  bin: 'text-white/75 hover:bg-white/10 hover:text-white',
}
type Look = typeof LIGHT

const field =
  'min-h-[44px] w-full rounded-lg border border-[#5B6B80] bg-white px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

/** Each person's circle colour, the same every time for the same name. Literal class names, so Tailwind keeps them. */
const AVATARS = [
  'bg-marigold',
  'bg-avatar-coral',
  'bg-avatar-pink',
  'bg-avatar-lavender',
  'bg-avatar-peach',
  'bg-avatar-rose',
  'bg-avatar-sand',
]
export function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATARS[h % AVATARS.length]
}

/** "Today, 3:12 PM", "Yesterday, 9:05 AM", "Oct 24" or "Oct 24, 2027" from another year. */
export function postedAt(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000
  )
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** The posts to show: every pinned one, then the newest few, unless all are asked for. */
export function shownPosts<T extends { pinned: boolean }>(posts: T[], all: boolean): T[] {
  if (all) return posts
  const pinned = posts.filter((p) => p.pinned)
  return [...pinned, ...posts.filter((p) => !p.pinned).slice(0, POSTS_SHOWN)]
}

export function AnnouncementList({
  posts,
  canReply,
  canRemove,
  onReply,
  onRemoveReply,
  meta,
  actions,
  dark = false,
}: {
  posts: AnnouncementView[]
  canReply: boolean
  /** Whether the caller may remove this reply: their own, or any for an organizer. */
  canRemove: (r: AnnouncementReplyView) => boolean
  /** Resolves true once the reply is saved. */
  onReply: (post: AnnouncementView, body: string) => Promise<boolean>
  onRemoveReply: (post: AnnouncementView, r: AnnouncementReplyView) => void
  /** Trip Control's line about who it went to. */
  meta?: (post: AnnouncementView) => ReactNode
  /** Trip Control's buttons on a post (Pin, Remove). */
  actions?: (post: AnnouncementView) => ReactNode
  /** On the trip page's dark purple box. */
  dark?: boolean
}) {
  const t = dark ? DARK : LIGHT
  const [all, setAll] = useState(false)
  const shown = shownPosts(posts, all)
  const hidden = posts.length - shown.length
  return (
    <>
      <ol className="flex flex-col">
        {shown.map((p) => (
          <li key={p.id} className={`border-t ${t.rule} py-4 first:border-t-0 first:pt-1`}>
            <Post
              post={p}
              canReply={canReply}
              canRemove={canRemove}
              onReply={onReply}
              onRemoveReply={onRemoveReply}
              meta={meta?.(p)}
              actions={actions?.(p)}
              t={t}
            />
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button type="button" className={`${t.outlined} self-start`} onClick={() => setAll(true)}>
          Show {hidden} earlier announcement{hidden === 1 ? '' : 's'}
        </button>
      )}
    </>
  )
}

function Post({
  post: p,
  canReply,
  canRemove,
  onReply,
  onRemoveReply,
  meta,
  actions,
  t,
}: {
  post: AnnouncementView
  canReply: boolean
  canRemove: (r: AnnouncementReplyView) => boolean
  onReply: (post: AnnouncementView, body: string) => Promise<boolean>
  onRemoveReply: (post: AnnouncementView, r: AnnouncementReplyView) => void
  meta?: ReactNode
  actions?: ReactNode
  t: Look
}) {
  const [allReplies, setAllReplies] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [removing, setRemoving] = useState<AnnouncementReplyView | null>(null)
  const replies = allReplies ? p.replies : p.replies.slice(-REPLIES_SHOWN)
  const earlier = p.replies.length - replies.length

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    if (await onReply(p, draft.trim())) setDraft('')
    setSending(false)
  }

  return (
    <article className="flex flex-col gap-2">
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${t.muted}`}>
        {p.pinned && (
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${t.tag}`}
          >
            Pinned
          </span>
        )}
        <span>
          {p.authorName} · {postedAt(p.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-base leading-relaxed [overflow-wrap:anywhere]">
        {p.body}
      </p>
      {(meta || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {meta}
          {actions}
        </div>
      )}
      {(p.replies.length > 0 || canReply) && (
        <div className={`mt-1 flex flex-col gap-3 border-l-2 ${t.rule} pl-3`}>
          {earlier > 0 && (
            <button
              type="button"
              className={`${t.outlined} self-start`}
              onClick={() => setAllReplies(true)}
            >
              Show {earlier} earlier repl{earlier === 1 ? 'y' : 'ies'}
            </button>
          )}
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              {/* Their first initial in a circle, as in the account menu. */}
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${avatarColor(r.authorName)} text-sm font-bold text-ink`}
              >
                {r.authorName.trim()[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-semibold">{r.authorName}</span>
                  {r.fromOrganizer && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${t.tag}`}
                    >
                      Host
                    </span>
                  )}
                  <span className={t.muted}>{postedAt(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-base [overflow-wrap:anywhere]">{r.body}</p>
              </div>
              {canRemove(r) && (
                <button
                  type="button"
                  aria-label={`Remove ${r.mine ? 'your' : `${r.authorName}’s`} reply`}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${t.bin}`}
                  onClick={() => setRemoving(r)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {canReply && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <label className="sr-only" htmlFor={`reply-${p.id}`}>
                Reply to everyone
              </label>
              <textarea
                id={`reply-${p.id}`}
                rows={1}
                maxLength={REPLY_MAX}
                className={`${field} resize-none`}
                placeholder="Reply to everyone…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                // Enter sends, as in a chat; Shift+Enter starts a new line.
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                  e.preventDefault()
                  void send()
                }}
              />
              {/* Always there, for anyone who doesn't know Enter sends. */}
              <button type="submit" className={t.filled} disabled={sending || !draft.trim()}>
                Reply
              </button>
            </form>
          )}
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={removing.mine ? 'Remove your reply?' : `Remove ${removing.authorName}’s reply?`}
          confirmLabel="Remove reply"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemoveReply(p, removing)
            setRemoving(null)
          }}
        >
          <p>Nobody on the trip will see it any more.</p>
        </ConfirmDialog>
      )}
    </article>
  )
}
