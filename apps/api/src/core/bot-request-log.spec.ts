import type { PrismaService } from '../prisma/prisma.service'
import {
  BOT_KEEP_MS,
  BotRequestLog,
  MAX_PATHS,
  TOP_PER_ROW,
  botRequestSummary,
  clean,
} from './bot-request-log'

const HOUR = 60 * 60 * 1000

function setup() {
  const botRequestTally = {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn(),
  }
  const prisma = { botRequestTally } as unknown as PrismaService
  const log = new BotRequestLog(prisma)
  log.now = () => 1_000 * HOUR
  return { log, botRequestTally, prisma }
}

describe('BotRequestLog', () => {
  afterEach(() => jest.restoreAllMocks())

  it('writes nothing when nothing was counted', async () => {
    const { log, botRequestTally } = setup()
    await log.flush()
    expect(botRequestTally.create).not.toHaveBeenCalled()
  })

  it('writes one row for a burst, by method and path without the query, most asked first', async () => {
    const { log, botRequestTally } = setup()
    for (let i = 0; i < 1_000; i++) log.note('GET', `/probe-${i % 30}?token=secret`)
    log.note('POST', '/webhook')
    await log.flush()
    expect(botRequestTally.create).toHaveBeenCalledTimes(1)
    const { data } = botRequestTally.create.mock.calls[0][0]
    expect(data.count).toBe(1_001)
    expect(data.paths).toHaveLength(TOP_PER_ROW)
    expect(data.paths[0]).toEqual({ path: 'GET /probe-0', count: 34 })
    expect(JSON.stringify(data.paths)).not.toContain('secret')
    expect(botRequestTally.deleteMany).toHaveBeenCalledWith({
      where: { at: { lt: new Date(1_000 * HOUR - BOT_KEEP_MS) } },
    })
    // the count starts again after a write
    await log.flush()
    expect(botRequestTally.create).toHaveBeenCalledTimes(1)
  })

  it('keeps counting past MAX_PATHS distinct paths without remembering more of them', async () => {
    const { log, botRequestTally } = setup()
    for (let i = 0; i < MAX_PATHS + 50; i++) log.note('GET', `/p${i}`)
    log.note('GET', `/p${MAX_PATHS + 10}`)
    await log.flush()
    const { data } = botRequestTally.create.mock.calls[0][0]
    expect(data.count).toBe(MAX_PATHS + 51)
    expect(data.paths.some((p: { path: string }) => p.path === `GET /p${MAX_PATHS + 10}`)).toBe(
      false
    )
  })

  it('never rejects when the database fails, and keeps the count for the next write', async () => {
    const { log, botRequestTally } = setup()
    botRequestTally.create.mockRejectedValueOnce(new Error('down'))
    jest
      .spyOn((log as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation()
    log.note('GET', '/.env')
    await expect(log.flush()).resolves.toBeUndefined()
    log.note('GET', '/.git/config')
    await log.flush()
    expect(botRequestTally.create.mock.calls[1][0].data.count).toBe(2)
  })

  it('shows ids, tokens and emails in a path as :id', () => {
    expect(clean('/.env?x=1')).toBe('/.env')
    expect(clean('/wp-json/wp/v2/users')).toBe('/wp-json/wp/v2/users')
    expect(clean('/api/trips/cm3x9k2f80000abcd1234/rooms')).toBe('/api/trips/:id/rooms')
    expect(clean('/api/public/stop-updates/Zq8_k2LmN0pQrStUvW')).toBe(
      '/api/public/stop-updates/:id'
    )
    expect(clean('/api/join/tulum-40th-2027')).toBe('/api/join/:id')
    expect(clean('/x/someone@example.com')).toBe('/x/:id')
  })
})

describe('botRequestSummary', () => {
  it('adds up the last 24 hours, the last 7 days and the top 5 paths', async () => {
    const { botRequestTally, prisma } = setup()
    const now = 1_000 * HOUR
    botRequestTally.findMany.mockResolvedValue([
      {
        at: new Date(now - HOUR),
        count: 10,
        paths: [
          { path: 'GET /.env', count: 6 },
          { path: 'POST /webhook', count: 4 },
        ],
      },
      {
        at: new Date(now - 3 * 24 * HOUR),
        count: 7,
        paths: [
          { path: 'GET /.env', count: 2 },
          { path: 'GET /a', count: 1 },
          { path: 'GET /b', count: 1 },
          { path: 'GET /c', count: 1 },
          { path: 'GET /d', count: 1 },
        ],
      },
    ])
    const summary = await botRequestSummary(prisma, now)
    expect(botRequestTally.findMany.mock.calls[0][0].where).toEqual({
      at: { gte: new Date(now - 7 * 24 * HOUR) },
    })
    expect(summary.day).toBe(10)
    expect(summary.week).toBe(17)
    expect(summary.topPaths).toEqual([
      { path: 'GET /.env', count: 8 },
      { path: 'POST /webhook', count: 4 },
      { path: 'GET /a', count: 1 },
      { path: 'GET /b', count: 1 },
      { path: 'GET /c', count: 1 },
    ])
  })
})
