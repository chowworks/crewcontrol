import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { dbTestsEnabled, migratedDb } from './testing/tenant-db'

// The BotRequestTally table on real Postgres, as the restricted role: it writes, reads and prunes rows with no
// request context (a scanner is no one), and a row always counts at least one request.
const suite = dbTestsEnabled ? describe : describe.skip

suite('BotRequestTally', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await migratedDb()
    await db.exec(`CREATE ROLE cc_app NOLOGIN;\n${appRoleGrantsSql('cc_app').join(';\n')};`)
  })
  afterAll(() => db.close())

  async function asApp<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE cc_app')
      return await fn()
    } finally {
      await db.exec('ROLLBACK')
    }
  }

  it('lets the restricted role write, read and delete tallies with no context', async () => {
    await asApp(async () => {
      await db.query(`INSERT INTO "BotRequestTally" (count, paths) VALUES (3, $1)`, [
        JSON.stringify([{ path: 'GET /.env', count: 3 }]),
      ])
      const r = await db.query<{ n: number }>(`SELECT sum(count)::int AS n FROM "BotRequestTally"`)
      expect(r.rows[0].n).toBe(3)
      expect((await db.query(`DELETE FROM "BotRequestTally"`)).affectedRows).toBe(1)
    })
  })

  it('refuses an empty tally', async () => {
    await asApp(async () => {
      await expect(db.query(`INSERT INTO "BotRequestTally" (count) VALUES (0)`)).rejects.toThrow(
        /BotRequestTally_count_check/
      )
    })
  })
})
