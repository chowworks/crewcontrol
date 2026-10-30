import type { OrganizerTrip } from '@cc/types'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { fileSlug } from '@/lib/csv'
import {
  downloadBlob,
  flyerFacts,
  pdfFromJpeg,
  type FlyerFacts,
  type FlyerFormat,
} from '@/lib/flyer'
import { drawFlyer, loadFlyerFonts } from '@/lib/flyer-draw'
import { Dialog } from './Dialog'
import { useToast } from './Toast'

const FORMATS: { value: FlyerFormat; label: string; size: string; file: string }[] = [
  { value: 'story', label: 'Story image', size: '1080 × 1920 pixels', file: 'Story image' },
  {
    value: 'letter',
    label: 'Printable page',
    size: 'Letter, 8.5 × 11 in',
    file: 'Printable flyer',
  },
]

/** The trip flyer (issue #15): a preview of the story image or the letter page, and a button to download it. */
export function FlyerDialog({ trip, onClose }: { trip: OrganizerTrip; onClose: () => void }) {
  const [format, setFormat] = useState<FlyerFormat>('story')
  const [made, setMade] = useState<{ facts: FlyerFacts; cover: HTMLImageElement | null } | null>(
    null
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const toast = useToast()

  // Only the public trip goes on a flyer, so nothing the trip page hides can get on it.
  useEffect(() => {
    if (!trip.published) return
    let live = true
    api
      .getPublicTrip(trip.slug)
      .then(async (pub) => {
        const [cover] = await Promise.all([
          loadCover(trip.id, pub.photos[0]?.url),
          loadFlyerFonts(),
        ])
        if (live) setMade({ facts: flyerFacts(pub, window.location.origin), cover })
      })
      .catch(() => live && setError('The flyer could not be made. Try again in a moment.'))
    return () => {
      live = false
    }
  }, [trip.id, trip.slug, trip.published])

  // The file is made with the preview, so pressing the button can hand it straight to the phone's share sheet
  // (which only opens from a tap, not after waiting on a canvas).
  useEffect(() => {
    if (!made) return
    const drawn = drawFlyer(made.facts, made.cover, format)
    const name = fileSlug(trip.name)
    let live = true
    let url: string | null = null
    const blob = (type: string, quality?: number) =>
      new Promise<Blob | null>((done) => drawn.toBlob(done, type, quality))
    ;(async () => {
      const png = await blob('image/png')
      if (!png || !live) return
      url = URL.createObjectURL(png)
      setPreview(url)
      if (format === 'story')
        setFile(new File([png], `${name}-flyer-story.png`, { type: png.type }))
      else {
        const jpeg = await blob('image/jpeg', 0.9)
        if (!jpeg || !live) return
        const pdf = pdfFromJpeg(new Uint8Array(await jpeg.arrayBuffer()), drawn)
        if (live) setFile(new File([pdf], `${name}-flyer.pdf`, { type: 'application/pdf' }))
      }
    })()
    return () => {
      live = false
      setFile(null)
      if (url) URL.revokeObjectURL(url)
    }
  }, [made, format, trip.name])

  // On a phone the share sheet opens, where "Save Image" puts a story in Photos for Instagram; elsewhere it downloads.
  async function download() {
    if (!file) return
    const done = FORMATS.find((f) => f.value === format)!.file.toLowerCase()
    const phone = window.matchMedia('(pointer: coarse)').matches
    if (phone && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        toast({ text: `Shared ${done}.` })
      } catch {
        // Closing the share sheet is not a failure.
      }
      return
    }
    downloadBlob(file, file.name)
    toast({ text: `Downloaded ${done}.` })
  }

  return (
    <Dialog title="Trip flyer" onClose={onClose}>
      {!trip.published ? (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-body">
          Publish the trip first. The flyer’s code opens the trip page, so the page has to be up.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body">
            Share it in a story or the group chat, or print it. It shows only what the trip page
            shows.
          </p>
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          <div role="radiogroup" aria-label="Flyer size" className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={format === f.value}
                onClick={() => setFormat(f.value)}
                className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 font-semibold ${
                  format === f.value
                    ? 'border-royal bg-royal-pale text-royal'
                    : 'border-rule text-body hover:border-royal'
                }`}
              >
                {f.label}
                <span className="block text-sm font-normal text-muted">{f.size}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-center rounded-2xl bg-ground p-4">
            {preview ? (
              <img
                src={preview}
                alt={`The ${format === 'story' ? 'story image' : 'printable page'} for ${trip.name}`}
                className="max-h-[52vh] w-auto rounded-lg shadow-[0_8px_24px_rgba(15,28,46,0.18)]"
              />
            ) : (
              !error && (
                <div
                  aria-busy="true"
                  className="flex aspect-[9/16] h-[52vh] max-h-[420px] animate-pulse items-center justify-center rounded-lg bg-rule px-4 text-center font-semibold text-muted"
                >
                  Making your flyer…
                </div>
              )
            )}
          </div>
          <button
            type="button"
            onClick={download}
            disabled={!file}
            className="min-h-[44px] rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-50"
          >
            {!preview
              ? 'Making your flyer…'
              : format === 'story'
                ? 'Download image'
                : 'Download PDF'}
          </button>
        </div>
      )}
    </Dialog>
  )
}

/**
 * The cover, ready to draw. A photo in the bucket comes through the API (the bucket allows no other site to draw
 * it); any other address loads directly, and a photo that can't be drawn leaves the flyer a royal wash instead.
 */
async function loadCover(tripId: string, url: string | undefined) {
  if (!url) return null
  const blob = await api.getFlyerCover(tripId).catch(() => null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = blob ? URL.createObjectURL(blob) : url
  try {
    await img.decode()
    return img
  } catch {
    return null
  }
}
