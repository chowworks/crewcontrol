/**
 * What Better Stack Uptime monitors for Travel HQ, and its section on its own public status page. CI applies this
 * file with scripts/betterstack-sync.ts on every push to main; see docs/monitoring.md. Copied from Audit Differently's
 * ops/monitoring.ts.
 *
 * A check is matched to its Better Stack monitor by URL, or by name when only the URL changed, so renaming a check or
 * moving its URL updates the monitor in place. Nothing is ever deleted: a check removed from this list is reported, and
 * the owner removes it in Better Stack.
 *
 * Monitors are named `${platform} · ${check name}` (alert emails and incidents use that name, so they say which
 * product) and all go in the monitor group `monitorGroup`. On the status page this product has one section,
 * titled `platform`, with a row per check of the same name. Every check is a "status code 2xx" check (the health
 * routes answer 503 when failing), every `checkFrequency` seconds, alerting the team by email.
 *
 * The address checked is the API that CI deploys, production (API_URL in .github/workflows/ci.yml), unless a check
 * gives its own `url`.
 */

export interface Check {
  /** The monitor's and the status page row's name. */
  name: string
  /** Path on the API, or `url` instead for a check on another address (the web app's pages). */
  path?: string
  /** The full address checked, when it is not on the API. */
  url?: string
  /** What it checks, in plain words: shown in the help icon on its status page row. */
  explanation: string
}

export interface Monitoring {
  /** The product's name: its section on the status page, its monitor group, and the start of every name. */
  platform: string
  /** The Better Stack monitor group all our monitors go in, matched by name. */
  monitorGroup: string
  /** The API's public address, without a trailing slash. Set from API_URL when the sync runs. */
  apiBase: string
  /** Seconds between checks. */
  checkFrequency: number
  statusPage: {
    /** The status page's title in Better Stack (`company_name`), only used if it ever has to be created. */
    name: string
    /** Its address, `<subdomain>.betteruptime.com`: the key the sync matches the page by. */
    subdomain: string
  }
  checks: Check[]
}

export const monitoring: Omit<Monitoring, 'apiBase'> = {
  platform: 'Travel HQ',
  monitorGroup: 'Travel HQ',
  checkFrequency: 300,
  statusPage: {
    // Travel HQ's own status page, not the chow-works page the Differently products share (owner's decision,
    // 2026-10-31): created by the sync if missing, never renamed. Its logos and its address,
    // status.travel-hq.app, are set in Better Stack.
    name: 'Travel HQ',
    subdomain: 'travel-hq',
  },
  checks: [
    {
      name: 'Server errors (last 15 min)',
      path: '/api/health/server-errors',
      explanation:
        'Down if any request to Travel HQ failed with a server error in the last 15 minutes.',
    },
    {
      // The web app on Vercel, which the API's checks never load: its routing middleware once failed on every trip
      // page (2026-11-01) while the API stayed healthy. A sample trip, so the seed keeps it in production.
      name: 'Trip pages',
      url: 'https://travel-hq.app/t/tulum-40th-2027',
      explanation: 'Down if a trip page does not open.',
    },
  ],
}
