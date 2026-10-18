import { randomBytes } from 'node:crypto'

/** "MV Beach House 2027" → "mv-beach-house-2027-k3f9": readable, with a short random tail so slugs never collide. */
export function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const tail = randomBytes(3).toString('hex').slice(0, 4)
  return base ? `${base}-${tail}` : `trip-${tail}`
}
