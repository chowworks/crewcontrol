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

// Real domains that sit one letter from a common one: never "corrected".
const VALID = new Set([
  'ymail.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'aim.com',
  'mac.com',
  'yahoo.ca',
  'yahoo.co.uk',
  'live.ca',
  'att.com',
  'outlook.ca',
])

// The part before the first dot ("gmail") and the rest ("com").
const split = (domain: string) => {
  const dot = domain.indexOf('.')
  return dot < 0 ? [domain, ''] : [domain.slice(0, dot), domain.slice(dot + 1)]
}

/**
 * The email with its domain corrected, or null. Only one slip is caught, so a real domain is rarely mistaken for a
 * typo: the name of a common domain with a wrong ending ("gmail.con"), or a name of four letters or more that is one
 * letter or one swap off a common one, with the same ending ("gmial.com", "yaho.com").
 */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const domain = email.slice(at + 1).toLowerCase()
  if (!domain || COMMON.includes(domain) || VALID.has(domain)) return null
  const [name, end] = split(domain)
  if (!end) return null
  const fix = COMMON.find((c) => {
    const [cName, cEnd] = split(c)
    if (name === cName) return distance(end, cEnd) === 1
    return end === cEnd && name.length >= 4 && cName.length >= 4 && distance(name, cName) === 1
  })
  return fix ? `${email.slice(0, at)}@${fix}` : null
}
