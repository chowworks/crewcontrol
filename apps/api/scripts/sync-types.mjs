// Copies packages/types/src/index.ts into the API as src/trips/trip-types.ts.
//
// The Railway build for the API only has the apps/api folder, so it cannot
// import the shared package. packages/types stays the single source (the web
// app imports it); the copy is generated, and a test fails CI if they differ.
//
//   npm run sync:types --workspace @cc/api
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const HEADER =
  '// Generated from packages/types/src/index.ts by `npm run sync:types`. Do not edit.\n\n'
const source = resolve(here, '../../../packages/types/src/index.ts')
const target = resolve(here, '../src/trips/trip-types.ts')

writeFileSync(target, HEADER + readFileSync(source, 'utf8'))
console.log(`Wrote ${target}`)
