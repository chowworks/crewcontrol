/**
 * The web addresses the API answers from a browser (CORS), from FRONTEND_URL: comma-separated, each an exact address,
 * or one with a `*` in its first label for Vercel's per-branch previews, e.g.
 * `https://travel-hq-git-*-ludakhris-projects.vercel.app`. The `*` stands for letters, digits and hyphens only, so
 * it never reaches past a dot into another domain. Only dev lists a pattern; production lists its own address.
 */
export function corsOrigins(list: string): (string | RegExp)[] {
  return list
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      if (!o.includes('*')) return o
      const m = /^(https:\/\/)([^./]*\*[^./]*)(\.[^/*]+)$/.exec(o)
      if (!m)
        throw new Error(
          `FRONTEND_URL: a * may only stand in the first part of an https address: ${o}`
        )
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const label = m[2].split('*').map(escape).join('[a-z0-9-]+')
      return new RegExp(`^${escape(m[1])}${label}${escape(m[3])}$`)
    })
}
