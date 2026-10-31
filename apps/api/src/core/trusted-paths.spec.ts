import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Every place the API acts as trusted work (runAsSystem: every trip, no person, the app.system mark that the Trip
 * insert and TripMember policies admit) or as a public page (runAsPublic: published trips, no person). A new call
 * site is a review item: add it here on purpose.
 */
const TRUSTED_CALL_SITES = [
  'messaging/resend-webhook.controller.ts', // Resend's signed notice that a guest's email bounced or was marked spam
  'receipts/forwarded-queue.ts', // an email Resend received for a receipts address, queued before anyone is known
  'receipts/forwarded-receipts.service.ts', // the worker that reads each queued email, finds its trip and guest
  'reminders/reminders.service.ts', // the hourly reminder run reads every trip; a stop link names a guest by its secret
  'trips/people.service.ts', // an invite turned into the membership of the person it was for, when they sign in
  'trips/trip-deletion.service.ts', // an owner restores a deleted trip (nobody's to read); the hourly run erases trips
  'trips/trips.service.ts', // a new trip and its owner row, as one step; an owner's deleted trips on Your trips
]
const PUBLIC_CALL_SITES = [
  'announcements/announcements.service.ts', // the join page's Announcements find the published trip by its link
  'questions/questions.service.ts', // asking a question finds the published trip by its link
  'contact/early-access.controller.ts', // the limited preview page's early access form, which needs no sign-in
  'join/join.service.ts', // the join page reads the published trip it shows a signed-in guest
  'trips/trips.controller.ts', // the guest trip page and the homepage's sample trips
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

function callSites(pattern: RegExp): string[] {
  const root = join(__dirname, '..')
  return files(root)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('tenant-context.ts'))
    .filter((f) => pattern.test(readFileSync(f, 'utf8')))
    .map((f) => relative(root, f))
    .sort()
}

describe('trusted work and public pages', () => {
  it('run as trusted work only from the call sites written down here', () => {
    expect(callSites(/\brunAsSystem\(/)).toEqual([...TRUSTED_CALL_SITES].sort())
  })

  it('run as a public page only from the call sites written down here', () => {
    expect(callSites(/\brunAsPublic\(/)).toEqual([...PUBLIC_CALL_SITES].sort())
  })
})
