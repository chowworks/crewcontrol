import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** How often the count in memory is written: one row at most this often, however many requests came. */
export const FLUSH_EVERY_MS = 15 * MINUTE
/** Rows older than this are deleted. */
export const BOT_KEEP_MS = 30 * DAY
/** Distinct paths kept in memory between writes; more still count, without their path, so a scan can't grow it. */
export const MAX_PATHS = 500
/** Paths each row keeps, most asked for first. */
export const TOP_PER_ROW = 20
/** The longest path kept. */
const MAX_PATH = 200

export interface PathCount {
  path: string
  count: number
}

/** The Track Metrics page's bot numbers: the last 24 hours, the last 7 days, and the 7 days' most asked-for paths. */
export interface BotRequestSummary {
  day: number
  week: number
  topPaths: PathCount[]
}

/**
 * Bot requests (owner's decision, 2026-11-21): requests the API turned away before they reached any route, such as a
 * scanner asking for /.env or sending a body it can't read. They are the caller's fault, so they never count as
 * server errors; this counts them for the Admin toolbox's Track Metrics page, and nothing alerts on them. Counted in
 * memory and written every 15 minutes, so a scan of a thousand requests a minute costs the database one row. A row is
 * when, how many and the top paths: no address, person or trip. A deploy loses at most the last 15 minutes' count.
 */
@Injectable()
export class BotRequestLog implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotRequestLog.name)
  private timer?: NodeJS.Timeout
  private total = 0
  private paths = new Map<string, number>()
  now: () => number = () => Date.now()

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS)
    this.timer.unref()
  }

  async onModuleDestroy() {
    clearInterval(this.timer)
    await this.flush()
  }

  /** Counts one request, by method and path without its query string. */
  note(method: string, url: string): void {
    this.total++
    const key = `${method} ${clean(url)}`.slice(0, MAX_PATH)
    const seen = this.paths.get(key)
    if (seen !== undefined) this.paths.set(key, seen + 1)
    else if (this.paths.size < MAX_PATHS) this.paths.set(key, 1)
  }

  /** Writes what was counted since the last write, if anything, and deletes rows past BOT_KEEP_MS. Never rejects. */
  async flush(): Promise<void> {
    if (!this.total) return
    const count = this.total
    const paths = [...this.paths]
      .map(([path, n]) => ({ path, count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_PER_ROW)
    this.total = 0
    this.paths = new Map()
    try {
      const at = this.now()
      await this.prisma.botRequestTally.create({ data: { at: new Date(at), count, paths } })
      await this.prisma.botRequestTally.deleteMany({
        where: { at: { lt: new Date(at - BOT_KEEP_MS) } },
      })
    } catch (err) {
      // the count waits for the next write; the paths are dropped
      this.total += count
      this.logger.error(`Could not write ${count} bot requests: ${(err as Error).message}`)
    }
  }
}

/**
 * A path without its query string, any segment that could be an id, token or email shown as `:id`: a wrong method on a
 * real route (`PUT /api/trips/<id>`) is turned away too, and its ids don't belong in the table.
 */
export function clean(url: string): string {
  return url
    .split('?')[0]
    .split('/')
    .map((seg) => (seg.length >= 16 || seg.includes('@') || /\d{4,}/.test(seg) ? ':id' : seg))
    .join('/')
}

/** The last 24 hours, the last 7 days and the 7 days' top 5 paths, from the written rows. */
export async function botRequestSummary(
  prisma: PrismaService,
  now = Date.now()
): Promise<BotRequestSummary> {
  const rows = await prisma.botRequestTally.findMany({
    where: { at: { gte: new Date(now - 7 * DAY) } },
    select: { at: true, count: true, paths: true },
  })
  let day = 0
  let week = 0
  const paths = new Map<string, number>()
  for (const row of rows) {
    week += row.count
    if (row.at.getTime() >= now - DAY) day += row.count
    for (const p of (row.paths as unknown as PathCount[]) ?? [])
      paths.set(p.path, (paths.get(p.path) ?? 0) + p.count)
  }
  const topPaths = [...paths]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 5)
  return { day, week, topPaths }
}
