import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ServerErrorFilter } from '../core/server-error.filter'
import { ServiceFailureLog } from '../core/service-failure-log'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
  // Every 5xx the API answers is counted for /api/health/server-errors (docs/monitoring.md).
  providers: [ServiceFailureLog, { provide: APP_FILTER, useClass: ServerErrorFilter }],
})
export class HealthModule {}
