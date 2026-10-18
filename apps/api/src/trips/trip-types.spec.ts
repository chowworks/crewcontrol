import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The API keeps a generated copy of packages/types (its Railway build only has apps/api).
it('trip-types.ts matches packages/types (run `npm run sync:types --workspace @cc/api`)', () => {
  const source = readFileSync(resolve(__dirname, '../../../../packages/types/src/index.ts'), 'utf8')
  const copy = readFileSync(resolve(__dirname, 'trip-types.ts'), 'utf8')
  expect(copy.slice(copy.indexOf('\n\n') + 2)).toBe(source)
})
