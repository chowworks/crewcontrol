import type { AnnouncementView, OrganizerTrip, TripQuestion } from '@cc/types'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { api } from '@/lib/api'
import { csvText, fileSlug, saveFile, stamp } from '@/lib/csv'
import { AUDIENCE_NAMES } from './TripAnnouncements'
import { interestRows } from './TripInterest'
import { tripLogRows } from './TripLog'
import { expenseRows, guestRows, paymentRows } from './TripMoney'

// Download everything (issue #2; owner's decision, 2026-10-30): one zip of the whole trip, offered on Trip Control and
// required before deleting it. The API makes the signed agreements (PDF) and the photos; the rest is built here from
// what Trip Control shows, the same spreadsheets as its own exports.

const ANSWERED: Record<TripQuestion['status'], string> = {
  waiting: 'Waiting for an answer',
  public: 'Answered on the trip page',
  private: 'Answered for the person who asked',
}

function questionsText(questions: TripQuestion[]): string {
  return (
    questions
      .map((q) =>
        [
          `Q: ${q.question}`,
          `A: ${q.answer ?? '(not answered)'}`,
          `${ANSWERED[q.status]}. ${q.askerName ? `Asked by ${q.askerName}` : 'Added by an organizer'}, ${stamp(q.createdAt)}.`,
        ].join('\n')
      )
      .join('\n\n') + '\n'
  )
}

function announcementsText(posts: AnnouncementView[]): string {
  return (
    posts
      .map((p) =>
        [
          `${stamp(p.createdAt)} · ${p.authorName} · ${AUDIENCE_NAMES[p.audience]}${p.pinned ? ' · Pinned' : ''}`,
          p.body,
          ...p.replies.map((r) => `\n    ${stamp(r.createdAt)} · ${r.authorName}: ${r.body}`),
        ].join('\n')
      )
      .join('\n\n---\n\n') + '\n'
  )
}

const readme = (trip: OrganizerTrip, when: string) => `${trip.name}
Downloaded from Travel HQ on ${when}.

guests-and-balances.csv  Each guest, where they stand and what they owe.
payments.csv             Every payment guests reported or you logged.
vendor-costs.csv         What the trip pays out.
trip-log.csv             Everything that happened on the trip, oldest first.
interested.csv           Who said they're interested before sign-ups opened.
agreements/              Each signed trip agreement, exactly as the guest signed it.
photos/                  The trip page's photos, in order (01 is the cover).
questions.txt            The trip's questions and answers.
announcements.txt        Announcements and guests' replies.
trip.json                All of the above as data, with the trip page's settings.

The spreadsheets open in Excel, Numbers or Google Sheets.
`

/** Builds the trip's zip and hands it to the browser to save. */
export async function downloadEverything(trip: OrganizerTrip): Promise<void> {
  const [files, log, expenses, rooms, questions, announcements, interested] = await Promise.all([
    api.getExportFiles(trip.id),
    api.getTripLog(trip.id),
    api.getExpenses(trip.id),
    api.getRooms(trip.id),
    api.getQuestions(trip.id),
    api.getAnnouncements(trip.id),
    api.getInterest(trip.id),
  ])
  const fromApi = unzipSync(files)
  const allQuestions = [...questions.waiting, ...questions.published, ...questions.private]
  const when = stamp(new Date().toISOString())!
  // Signed photo links stop working within hours, so the data names the photo's file instead when it's in the zip.
  const photos = trip.photos.map((p, i) => {
    const file = Object.keys(fromApi).find((f) =>
      f.startsWith(`photos/${String(i + 1).padStart(2, '0')}.`)
    )
    return file ? { caption: p.caption, file } : p
  })
  const data = {
    exportedAt: new Date().toISOString(),
    trip: { ...trip, photos },
    rooms,
    expenses,
    questions: allQuestions,
    announcements: announcements.announcements,
    interested,
    log,
  }

  const dir = fileSlug(trip.name) || 'trip'
  const zip: Zippable = {
    'README.txt': strToU8(readme(trip, when)),
    'guests-and-balances.csv': strToU8(csvText(guestRows(trip))),
    'payments.csv': strToU8(csvText(paymentRows(trip))),
    'vendor-costs.csv': strToU8(csvText(expenseRows(expenses))),
    'trip-log.csv': strToU8(csvText(tripLogRows(log))),
    'interested.csv': strToU8(csvText(interestRows(interested))),
    'questions.txt': strToU8(questionsText(allQuestions)),
    'announcements.txt': strToU8(announcementsText(announcements.announcements)),
    'trip.json': strToU8(JSON.stringify(data, null, 2)),
  }
  // PDFs and photos are compressed already.
  for (const [name, bytes] of Object.entries(fromApi)) zip[name] = [bytes, { level: 0 }]

  const filename = `${dir}-travel-hq.zip`
  const bytes = zipSync({ [dir]: zip })
  saveFile(filename, new Blob([bytes], { type: 'application/zip' }))
}
