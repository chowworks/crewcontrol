import type { TripPhoto } from '@cc/types'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'

// Grid position of each of the first five tiles: a big lead photo, then four around it.
// Two columns on a phone, four from the sm breakpoint.
const TILE = [
  'col-span-2 row-span-2',
  'col-span-1 sm:col-span-2',
  'col-span-1',
  'col-span-1',
  'col-span-1 sm:col-span-4',
]

export function PhotoGallery({ title, photos }: { title: string; photos: TripPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const shown = photos.slice(0, TILE.length)

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[26px] font-extrabold">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="py-2.5 text-[15px] font-semibold text-royal hover:text-royal-dark"
        >
          See all {photos.length} photos
        </button>
      </div>
      <div className="grid auto-rows-[100px] grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:auto-rows-[120px] sm:grid-cols-4">
        {shown.map((photo, i) => (
          <button
            key={photo.url + i}
            type="button"
            onClick={() => setOpen(i)}
            className={`${TILE[i]} relative overflow-hidden bg-placeholder focus:outline-none focus-visible:ring-4 focus-visible:ring-royal`}
            aria-label={`View photo${photo.caption ? `: ${photo.caption}` : ` ${i + 1}`}`}
          >
            <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            {photo.caption && (
              <span className="absolute bottom-2.5 left-2.5 rounded-md bg-ink/75 px-2 py-0.5 text-[13px] font-semibold text-white">
                {photo.caption}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  )
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: TripPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const photo = photos[index]
  const step = (by: number) => onIndex((index + by + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onIndex, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-white"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm">
          {index + 1} of {photos.length}
          {photo.caption && ` · ${photo.caption}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photos"
          className="rounded-full p-3 hover:bg-white/10"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-2 px-2 pb-6">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous photo"
          className="rounded-full p-3 hover:bg-white/10"
        >
          <ChevronLeft className="h-7 w-7" aria-hidden="true" />
        </button>
        <img
          src={photo.url}
          alt={photo.caption}
          className="mx-auto max-h-full min-w-0 max-w-full flex-1 object-contain"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next photo"
          className="rounded-full p-3 hover:bg-white/10"
        >
          <ChevronRight className="h-7 w-7" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
