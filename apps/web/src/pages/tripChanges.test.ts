import type { TripLogEntry } from '@cc/types'
import { describe, expect, it } from 'vitest'
import {
  type ChangeEntry,
  type ChangeGroup,
  changeSentence,
  groupText,
  mergeEdits,
} from './tripChanges'

const edit = (at: string, change: ChangeEntry['change'], actorName = 'Kendra'): ChangeEntry => ({
  kind: 'change',
  at,
  byAdmin: false,
  actorName,
  change,
})
const price = (from: string, to: string): ChangeEntry['change'] => ({
  what: 'trip',
  fields: [{ field: 'price', from, to }],
})

describe('mergeEdits', () => {
  it("folds one person's editor saves within 15 minutes of each other into one line", () => {
    // Newest first, as the API sends the log.
    const log: TripLogEntry[] = [
      edit('2026-11-01T10:20:00Z', { what: 'trip', fields: [{ field: 'photos' }] }),
      edit('2026-11-01T10:10:00Z', price('$240', '$250')),
      edit('2026-11-01T10:00:00Z', price('$235', '$240')),
      edit('2026-11-01T09:00:00Z', { what: 'trip', fields: [{ field: 'highlights' }] }),
    ]
    const merged = mergeEdits(log)
    expect(merged).toHaveLength(2)
    const kendra = merged[0] as ChangeGroup
    expect(kendra.entries).toHaveLength(3)
    expect(kendra.first).toBe('2026-11-01T10:00:00Z')
    expect(groupText(kendra)).toBe('Kendra changed the price ($235 → $250) and the photos')
    // An hour earlier: a separate line.
    expect(groupText(merged[1] as ChangeGroup)).toBe('Kendra changed the highlights')
  })

  it("ends a line at someone else's edit, so nobody takes credit for another's change", () => {
    const merged = mergeEdits([
      edit('2026-11-01T10:20:00Z', price('$245', '$250')),
      edit('2026-11-01T10:15:00Z', price('$240', '$245'), 'Jordan'),
      edit('2026-11-01T10:10:00Z', price('$235', '$240')),
    ])
    expect(merged.map((g) => groupText(g as ChangeGroup))).toEqual([
      'Kendra changed the price ($245 → $250)',
      'Jordan changed the price ($240 → $245)',
      'Kendra changed the price ($235 → $240)',
    ])
  })

  it('leaves other lines alone and says when a change was put back', () => {
    const post = edit('2026-11-01T10:06:00Z', {
      what: 'announcement',
      action: 'posted',
      text: 'Bring a swimsuit',
    })
    const merged = mergeEdits([
      edit('2026-11-01T10:10:00Z', {
        what: 'trip',
        fields: [
          { field: 'price', from: '$250', to: '$235' },
          { field: 'published', from: 'off', to: 'on' },
        ],
      }),
      post,
      edit('2026-11-01T10:00:00Z', {
        what: 'trip',
        fields: [
          { field: 'price', from: '$235', to: '$250' },
          { field: 'published', from: 'on', to: 'off' },
        ],
      }),
    ])
    expect(merged).toHaveLength(2)
    expect(groupText(merged[0] as ChangeGroup)).toBe(
      'Kendra unpublished and republished the trip and changed the price (and put it back)'
    )
    expect(merged[1]).toBe(post)
  })

  it('reads switches, rooms and publishing in plain words, the clauses kept apart', () => {
    const merged = mergeEdits([
      edit('2026-11-01T10:02:00Z', {
        what: 'rooms',
        added: [],
        removed: ['Room 5'],
        renamed: [{ from: 'Room 4', to: 'Bunk room' }],
        prices: [{ room: 'Loft', from: '$220', to: '$250' }],
        other: false,
      }),
      edit('2026-11-01T10:01:00Z', {
        what: 'rooms',
        added: ['Room 4', 'Room 5'],
        removed: [],
        renamed: [],
        prices: [{ room: 'Loft', from: '$200', to: '$220' }],
        other: false,
      }),
      edit('2026-11-01T10:00:00Z', {
        what: 'trip',
        fields: [
          { field: 'published', from: 'off', to: 'on' },
          { field: 'saveTheDate', from: 'on', to: 'off' },
          { field: 'price', from: '$235', to: '$250' },
          { field: 'photos' },
        ],
      }),
    ])
    expect(groupText(merged[0] as ChangeGroup)).toBe(
      'Kendra published the trip, turned off save the date, changed the price ($235 → $250) and the photos, added Bunk room, and changed the price of Loft ($200 → $250)'
    )
  })
})

describe('changeSentence', () => {
  it('says "An admin" for the admin', () => {
    expect(
      changeSentence({ ...edit('2026-11-01T10:00:00Z', { what: 'trip_deleted' }), byAdmin: true })
    ).toBe('An admin deleted the trip')
  })
})
