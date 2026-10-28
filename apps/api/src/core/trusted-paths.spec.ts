import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Every place the API acts as trusted work (runAsSystem: every trip, no person, the app.system mark that the Trip
 * insert and TripMember policies admit) or as a public page (runAsPublic: published trips, no person). A new call
 * site is a review item: add it here on purpose.
 */
const TRUSTED_CALL_SITES = [
  'trips/people.service.ts', // an invite turned into the membership of the person it was for, when they sign in
  'trips/trips.service.ts', // a new trip and its owner row, as one step
]
const PUBLIC_CALL_SITES = [
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
