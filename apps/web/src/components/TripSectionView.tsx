import type { TripSection } from '@cc/types'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Lightbox } from './PhotoGallery'

/**
 * The photo grid by how many photos a section has (index), so it never ends on a gap: two across on a phone and up to
 * three on a wide screen, and the first photo runs wider when the count doesn't fill the rows.
 */
const GRID = [
  '',
  'grid-cols-1',
  'grid-cols-2',
  'grid-cols-2 sm:grid-cols-3',
  'grid-cols-2',
  'grid-cols-2 sm:grid-cols-3',
  'grid-cols-2 sm:grid-cols-3',
]
const FIRST = ['', '', '', 'col-span-2 sm:col-span-1', '', 'col-span-2', '']

/**
 * One of the organizer's own sections on the trip page (issue #85): its title, its text and its photos, which open
 * full size. A section for accepted guests only says so, as only they (and the organizer's preview) ever get one.
 */
export function TripSectionView({ section }: { section: TripSection }) {
  const [open, setOpen] = useState<number | null>(null)
  const { photos } = section
  return (
    <section className="flex flex-col gap-3">
      <h2 className="break-words text-[26px] font-extrabold">{section.title}</h2>
      {section.acceptedOnly && (
        <span className="-mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-royal-pale px-3 py-1 text-[13px] font-semibold text-royal">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Only accepted guests see this
        </span>
      )}
      {section.body && (
        <p className="max-w-[62ch] whitespace-pre-line break-words text-[17px] text-body">
          {section.body}
        </p>
      )}
      {photos.length > 0 && (
        <div
          className={`grid gap-2 overflow-hidden rounded-2xl ${
            photos.length === 1
              ? 'auto-rows-[220px] sm:auto-rows-[320px]'
              : 'auto-rows-[130px] sm:auto-rows-[180px]'
          } ${GRID[Math.min(photos.length, GRID.length - 1)]}`}
        >
          {photos.map((photo, i) => (
            <button
              key={photo.url + i}
              type="button"
              onClick={() => setOpen(i)}
              className={`relative overflow-hidden bg-placeholder focus:outline-none focus-visible:ring-4 focus-visible:ring-royal ${
                i === 0 ? FIRST[Math.min(photos.length, FIRST.length - 1)] : ''
              }`}
              aria-label={`View photo ${i + 1} of ${section.title}`}
            >
              <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {open !== null && (
        <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  )
}
