// Catching a likely typo in an email's domain ("gmial.com"), so the admin doesn't add a membership nobody can use.
// Only a suggestion: an address it doesn't know is never called wrong.

const COMMON = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'me.com',
  'live.com',
  'msn.com',
  'comcast.net',
  'att.net',
  'verizon.net',
]

/** Edits between two strings, with a swap of two letters side by side counted as one ("gmial" → "gmail"). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** The email with its domain corrected, when the domain is one or two letters off a common one; otherwise null. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const domain = email.slice(at + 1).toLowerCase()
  if (!domain || COMMON.includes(domain)) return null
  let best: string | null = null
  let bestDistance = 3
  for (const c of COMMON) {
    const n = distance(domain, c)
    if (n < bestDistance) {
      best = c
      bestDistance = n
    }
  }
  return best ? `${email.slice(0, at)}@${best}` : null
}
