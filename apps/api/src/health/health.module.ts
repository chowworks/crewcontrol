import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { BotRequestLog } from '../core/bot-request-log'
import { ServerErrorFilter } from '../core/server-error.filter'
import { ServiceFailureLog } from '../core/service-failure-log'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
  // Every 5xx the API answers is counted for /api/health/server-errors (docs/monitoring.md); requests turned away before
  // any route are counted as bot requests for Track Metrics.
  providers: [
    ServiceFailureLog,
    BotRequestLog,
    { provide: APP_FILTER, useClass: ServerErrorFilter },
  ],
})
export class HealthModule {}
