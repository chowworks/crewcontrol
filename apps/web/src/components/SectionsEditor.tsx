import {
  MAX_SECTION_PHOTOS,
  MAX_TRIP_PHOTOS,
  MAX_TRIP_SECTIONS,
  SECTION_TITLE_IDEAS,
  type TripSection,
} from '@cc/types'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { field } from '@/components/EditorParts'
import { api } from '@/lib/api'
import { shrinkPhoto } from '@/lib/resize'

const iconButton = 'rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink disabled:opacity-30'

const AUDIENCES = [
  { acceptedOnly: false, label: 'Everyone', line: 'Anyone with the trip link' },
  {
    acceptedOnly: true,
    label: 'Accepted guests only',
    line: 'Only on their own trip page',
  },
] as const

const EMPTY: TripSection = { title: '', body: '', photos: [], acceptedOnly: false }

/** Who sees a section, in a few words, for its row and the trip page. */
export const audienceOf = (s: TripSection) => (s.acceptedOnly ? 'Accepted guests only' : 'Everyone')

/**
 * The trip editor's Sections card (issue #85): the organizer's own parts of the trip page, each a title, text,
 * photos and who sees it. Adding or changing one opens a dialog; the trip saves as the editor does, on a step change
 * or Save. `otherPhotos` is every photo on the trip outside the sections, which share the trip's photo limit.
 */
export function SectionsEditor({
  sections,
  otherPhotos,
  onChange,
}: {
  sections: TripSection[]
  otherPhotos: number
  onChange: (sections: TripSection[]) => void
}) {
  // The section being added ('new') or changed (its place), with the dialog's copy of it.
  const [editing, setEditing] = useState<{ at: number | 'new'; draft: TripSection } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const sectionPhotos = sections.reduce((n, s) => n + s.photos.length, 0)

  const move = (from: number, to: number) => {
    const next = [...sections]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <>
      <p className="text-sm text-muted">
        Your own parts of the trip page, after the highlights: getting there, what to pack, anything
        guests should know. Up to {MAX_TRIP_SECTIONS}.
      </p>
      {sections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sections.map((s, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rule p-3"
            >
              <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                <span className="truncate font-semibold">{s.title}</span>
                <span className="text-sm text-muted">
                  {audienceOf(s)}
                  {s.photos.length > 0 &&
                    ` · ${s.photos.length} photo${s.photos.length === 1 ? '' : 's'}`}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => setEditing({ at: i, draft: s })}
                  className="mr-1 inline-flex min-h-[44px] items-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
                  aria-label={`Edit ${s.title}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Move ${s.title} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Move ${s.title} down`}
                  disabled={i === sections.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Remove ${s.title}`}
                  onClick={() => setRemoving(i)}
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {sections.length < MAX_TRIP_SECTIONS && (
        <button
          type="button"
          onClick={() => setEditing({ at: 'new', draft: EMPTY })}
          className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl border border-royal px-4 font-semibold text-royal"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add section
        </button>
      )}

      {editing && (
        <SectionDialog
          initial={editing.draft}
          isNew={editing.at === 'new'}
          // What this section may hold: the trip's limit less every other photo, and at most its own limit.
          photoRoom={Math.min(
            MAX_SECTION_PHOTOS,
            MAX_TRIP_PHOTOS -
              otherPhotos -
              (sectionPhotos - (editing.at === 'new' ? 0 : sections[editing.at].photos.length))
          )}
          onClose={() => setEditing(null)}
          onSave={(section) => {
            onChange(
              editing.at === 'new'
                ? [...sections, section]
                : sections.map((s, j) => (j === editing.at ? section : s))
            )
            setEditing(null)
          }}
        />
      )}
      {removing !== null && (
        <ConfirmDialog
          title={`Remove ${sections[removing].title}?`}
          confirmLabel="Remove section"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onChange(sections.filter((_, j) => j !== removing))
            setRemoving(null)
          }}
        >
          Its text and photos come off the trip page when you save.
        </ConfirmDialog>
      )}
    </>
  )
}

function SectionDialog({
  initial,
  isNew,
  photoRoom,
  onClose,
  onSave,
}: {
  initial: TripSection
  isNew: boolean
  photoRoom: number
  onClose: () => void
  onSave: (section: TripSection) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [titleTouched, setTitleTouched] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  // Uploads stop once the dialog is gone, so a cancelled section doesn't keep sending photos.
  const open = useRef(true)
  useEffect(
    () => () => {
      open.current = false
    },
    []
  )
  const set = (patch: Partial<TripSection>) => setDraft((d) => ({ ...d, ...patch }))
  // A stray tap outside or Escape asks first once something was typed or added.
  const changed = uploading || JSON.stringify(draft) !== JSON.stringify(initial)
  const close = () => (changed ? setLeaving(true) : onClose())
  const titleProblem = draft.title.trim() ? null : 'Give the section a title.'
  const left = photoRoom - draft.photos.length

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const picked = Array.from(files).slice(0, Math.max(0, left))
    setUploading(true)
    setError(null)
    try {
      for (const file of picked) {
        if (!open.current) return
        const blob = await shrinkPhoto(file)
        if (!open.current) return
        const { url } = await api.uploadPhoto(blob, file.name.replace(/\.\w+$/, '') + '.jpg')
        if (!open.current) return
        setDraft((d) => ({ ...d, photos: [...d.photos, { url, caption: '' }] }))
      }
      if (files.length > picked.length)
        setError(
          photoRoom < MAX_SECTION_PHOTOS
            ? `The trip has room for ${MAX_TRIP_PHOTOS} photos in all. Extra ones were skipped.`
            : `A section can have ${MAX_SECTION_PHOTOS} photos. Extra ones were skipped.`
        )
    } catch (err) {
      if (open.current) setError(err instanceof Error ? err.message : 'A photo failed to upload.')
    } finally {
      if (open.current) setUploading(false)
    }
  }

  return (
    <Dialog title={isNew ? 'Add a section' : 'Edit section'} onClose={close}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTitleTouched(true)
          if (titleProblem || uploading) return
          onSave({ ...draft, title: draft.title.trim(), body: draft.body.trim() })
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Title
            <input
              className={field}
              value={draft.title}
              maxLength={60}
              placeholder="For example: Getting there"
              onChange={(e) => set({ title: e.target.value })}
              onBlur={() => setTitleTouched(true)}
            />
          </label>
          {titleTouched && titleProblem && (
            <span className="text-sm font-semibold text-[#B42318]">{titleProblem}</span>
          )}
          <div role="group" className="flex flex-wrap gap-2" aria-label="Title ideas">
            {SECTION_TITLE_IDEAS.map((idea) => {
              const on = draft.title.trim() === idea
              return (
                <button
                  key={idea}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ title: idea })}
                  className={`min-h-[44px] rounded-full border-[1.5px] border-royal px-4 text-[15px] font-semibold ${
                    on ? 'bg-royal text-white' : 'bg-white text-royal hover:bg-royal-pale'
                  }`}
                >
                  {idea}
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          What guests should know
          <textarea
            className={`${field} min-h-[140px] font-normal`}
            value={draft.body}
            maxLength={2000}
            placeholder="Write it the way you’d text the group."
            onChange={(e) => set({ body: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">
            Photos{' '}
            <span className="font-normal text-muted">(optional, up to {MAX_SECTION_PHOTOS})</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {draft.photos.map((p, i) => (
              <span key={p.url + i} className="relative">
                <img
                  src={p.url}
                  alt=""
                  className="h-[72px] w-[72px] rounded-lg bg-placeholder object-cover"
                />
                {/* A 44px tap area around the small visible circle. */}
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}
                  className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-white">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              </span>
            ))}
            {left > 0 && (
              <label className="grid h-[72px] w-[72px] cursor-pointer place-items-center rounded-lg border-[1.5px] border-dashed border-royal text-royal focus-within:ring-2 focus-within:ring-royal">
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
                <span className="sr-only">{uploading ? 'Uploading…' : 'Add photos'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    void addPhotos(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
          {uploading && <span className="text-sm text-muted">Uploading…</span>}
          {left <= 0 && draft.photos.length < MAX_SECTION_PHOTOS && (
            <span className="text-sm text-muted">
              The trip has {MAX_TRIP_PHOTOS} photos, your sections&apos; included. Remove one to add
              more.
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Who sees it</span>
          <div role="radiogroup" aria-label="Who sees it" className="grid grid-cols-2 gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.label}
                type="button"
                role="radio"
                aria-checked={draft.acceptedOnly === a.acceptedOnly}
                onClick={() => set({ acceptedOnly: a.acceptedOnly })}
                className={`flex min-h-[44px] flex-col items-start rounded-xl border-2 px-3 py-2 text-left ${
                  draft.acceptedOnly === a.acceptedOnly
                    ? 'border-royal bg-royal-pale'
                    : 'border-rule bg-white'
                }`}
              >
                <span className="font-semibold text-ink">{a.label}</span>
                <span className="text-sm text-muted">{a.line}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-royal px-5 font-semibold text-royal hover:bg-royal-pale"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
          >
            {isNew ? 'Add section' : 'Save section'}
          </button>
        </div>
      </form>
      {leaving && (
        <ConfirmDialog
          title={isNew ? 'Discard this section?' : 'Discard your changes?'}
          confirmLabel="Discard"
          onCancel={() => setLeaving(false)}
          onConfirm={onClose}
        >
          {isNew ? 'What you wrote and added here won’t be kept.' : 'The section stays as it was.'}
        </ConfirmDialog>
      )}
    </Dialog>
  )
}
