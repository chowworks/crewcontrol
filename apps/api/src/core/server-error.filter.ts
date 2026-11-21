import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request } from 'express'
import { BotRequestLog } from './bot-request-log'
import { ServiceFailureLog } from './service-failure-log'

/**
 * Every error the API answers with a 5xx is counted for the /api/health/server-errors check, by its route pattern
 * (`GET /api/trips/:id`, never the ids). Nest's own handling then answers as it always did; a 4xx (the request's
 * fault) is not counted. An error that carries its own status, such as the body reader's 415 for a compression it
 * can't read, is answered with that status by Nest, so it is counted by it too. A 4xx on a request that reached no
 * route (a path the API doesn't have, a body it couldn't read) is counted as a bot request for Track Metrics.
 */
@Catch()
export class ServerErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(ServerErrorFilter.name)

  constructor(
    private readonly failures: ServiceFailureLog,
    private readonly bots: BotRequestLog
  ) {
    super()
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = statusOf(exception)
    if (host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request>()
      const route = (req.route as { path?: string } | undefined)?.path
      if (status >= 500)
        void this.failures.record('server', `${req.method} ${route ?? 'unmatched'}`)
      // turned away before any route: a path the API doesn't have, or a body it couldn't read
      else if (status >= 400 && !route) {
        const parser = (exception as { type?: unknown } | null)?.type
        if (typeof parser === 'string') {
          // a body it couldn't read can be a real person's (a trip too big to save): the log keeps the detail
          this.logger.warn(`${status} ${parser} on ${req.method} ${req.originalUrl ?? req.url}`)
          this.bots.note(req.method, '[unreadable body]')
        } else this.bots.note(req.method, req.originalUrl ?? req.url)
      }
    }
    super.catch(exception, host)
  }
}

/** The status Nest answers with: an HttpException's, else an error's own `statusCode` (as Nest's isHttpError), else 500. */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus()
  const err = exception as { statusCode?: unknown; message?: unknown } | null
  const code = Number(err?.statusCode)
  if (err?.statusCode && err.message && code >= 100 && code <= 599) return code
  return 500
}
