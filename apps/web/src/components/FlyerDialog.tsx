import type { OrganizerTrip } from '@cc/types'
import { useEffect, useRef, useState } from 'react'
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

const FORMATS: { value: FlyerFormat; label: string; file: string }[] = [
  { value: 'story', label: 'Story image', file: 'Story image' },
  { value: 'letter', label: 'Printable page', file: 'Printable flyer' },
]

/** The trip flyer (issue #15): a preview of the story image or the letter page, and a button to download it. */
export function FlyerDialog({ trip, onClose }: { trip: OrganizerTrip; onClose: () => void }) {
  const [format, setFormat] = useState<FlyerFormat>('story')
  const [made, setMade] = useState<{ facts: FlyerFacts; cover: HTMLImageElement | null } | null>(
    null
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
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

  useEffect(() => {
    if (!made) return
    const drawn = drawFlyer(made.facts, made.cover, format)
    canvas.current = drawn
    let url: string | null = null
    drawn.toBlob((blob) => {
      if (!blob) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    }, 'image/png')
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [made, format])

  function download() {
    const drawn = canvas.current
    if (!drawn) return
    const name = fileSlug(trip.name)
    const done = FORMATS.find((f) => f.value === format)!.file
    if (format === 'story')
      drawn.toBlob((png) => {
        if (!png) return
        downloadBlob(png, `${name}-flyer-story.png`)
        toast({ text: `Downloaded ${done}.` })
      }, 'image/png')
    else
      drawn.toBlob(
        async (jpeg) => {
          if (!jpeg) return
          const bytes = new Uint8Array(await jpeg.arrayBuffer())
          downloadBlob(pdfFromJpeg(bytes, drawn), `${name}-flyer.pdf`)
          toast({ text: `Downloaded ${done}.` })
        },
        'image/jpeg',
        0.9
      )
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
                className={`min-h-[44px] flex-1 rounded-xl border px-3 font-semibold ${
                  format === f.value
                    ? 'border-royal bg-royal-pale text-royal'
                    : 'border-rule text-body hover:border-royal'
                }`}
              >
                {f.label}
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
                  className="aspect-[9/16] h-[52vh] max-h-[420px] animate-pulse rounded-lg bg-rule"
                />
              )
            )}
          </div>
          <button
            type="button"
            onClick={download}
            disabled={!preview}
            className="min-h-[44px] rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-50"
          >
            {format === 'story' ? 'Download image' : 'Download PDF'}
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
