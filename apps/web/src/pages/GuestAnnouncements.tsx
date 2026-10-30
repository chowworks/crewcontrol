import type { GuestAnnouncements } from '@cc/types'
import { useEffect, useState } from 'react'
import { AnnouncementList } from '@/components/Announcements'
import { TileArt } from '@/components/TileArt'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'

// The trip page's Announcements for a guest on the trip (issue #12): what the organizers posted for them, and the
// replies under each, which everyone the post went to sees. Hidden until there is a post.

export function AnnouncementsSection({ slug }: { slug: string }) {
  const toast = useToast()
  const [data, setData] = useState<GuestAnnouncements | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api
      .getGuestAnnouncements(slug)
      .then(setData)
      .catch(() => setData(null))
  }, [slug])

  async function change(step: () => Promise<GuestAnnouncements>, done: string): Promise<boolean> {
    try {
      setData(await step())
      setError(null)
      toast({ text: done })
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t save. Try again.')
      return false
    }
  }

  if (!data || data.announcements.length === 0) return null
  return (
    // The trip page's dark purple box, as "Want in?" is for someone who hasn't joined (owner's decision, 2026-10-29).
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-royal p-6 text-white shadow-card">
      <TileArt />
      <h2 className="relative font-display text-[28px] font-extrabold leading-tight">
        Announcements
      </h2>
      {error && (
        <p role="alert" className="relative font-semibold">
          {error}
        </p>
      )}
      <div className="relative flex flex-col">
        <AnnouncementList
          dark
          posts={data.announcements}
          canReply={data.canReply}
          canRemove={(r) => r.mine}
          onReply={(p, body) => change(() => api.replyAsGuest(slug, p.id, body), 'Reply posted.')}
          onRemoveReply={(p, r) =>
            void change(() => api.removeOwnReply(slug, p.id, r.id), 'Reply removed.')
          }
        />
      </div>
    </section>
  )
}
