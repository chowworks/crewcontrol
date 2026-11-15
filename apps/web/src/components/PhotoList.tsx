import type { TripPhoto } from '@cc/types'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { field } from '@/components/EditorParts'

const iconButton = 'rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink disabled:opacity-30'

/**
 * The editor's photo lists (the trip's Photos card and a section's photos): drag a row by its grip, or use the
 * arrows. The grip alone starts a drag, so on a phone a swipe still scrolls and a tap on the photo still opens it.
 * Keyboard users have the arrows, so the grip stays out of the tab order.
 */
export function PhotoList({
  photos,
  onChange,
  onOpen,
  captions = false,
}: {
  photos: TripPhoto[]
  onChange: (photos: TripPhoto[]) => void
  onOpen: (index: number) => void
  /** A caption box on each row (the trip's photos; a section's photos have none). */
  captions?: boolean
}) {
  // The same photo can be added twice, so its place among equal links makes the id unique.
  const ids = photos.map(
    (p, i) => `${p.url}#${photos.slice(0, i).filter((q) => q.url === p.url).length}`
  )
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const moveTo = (from: number, to: number) => onChange(arrayMove(photos, from, to))

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    moveTo(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-3">
          {photos.map((p, i) => (
            <Row key={ids[i]} id={ids[i]}>
              <button
                type="button"
                aria-label={`Open photo ${i + 1}`}
                onClick={() => onOpen(i)}
                className="shrink-0 rounded-lg"
              >
                <img
                  src={p.url}
                  alt=""
                  className="h-16 w-20 rounded-lg bg-placeholder object-cover"
                />
              </button>
              {captions && (
                <input
                  className={`${field} order-last min-w-0 basis-full sm:order-none sm:flex-1`}
                  aria-label={`Caption for photo ${i + 1}`}
                  value={p.caption}
                  placeholder={i === 0 ? 'Cover photo caption' : 'Caption'}
                  onChange={(e) =>
                    onChange(
                      photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                    )
                  }
                />
              )}
              <div className="ml-auto flex shrink-0">
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Move photo ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => moveTo(i, i - 1)}
                >
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Move photo ${i + 1} down`}
                  disabled={i === photos.length - 1}
                  onClick={() => moveTo(i, i + 1)}
                >
                  <ArrowDown className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onChange(photos.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex flex-wrap items-center gap-3 rounded-xl bg-white ${
        isDragging ? 'z-10 shadow-card ring-2 ring-royal' : ''
      }`}
    >
      {/* A 44px grip; touch-action none so a drag here never scrolls the page. */}
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden="true"
        title="Drag to move"
        className="-mr-1 grid h-11 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-ground hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" />
      </span>
      {children}
    </li>
  )
}
