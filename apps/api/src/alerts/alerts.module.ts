import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MessagingModule } from '../messaging/messaging.module'
import { AlertsService } from './alerts.service'

@Module({
  imports: [AuthModule, MessagingModule],
  providers: [AlertsService],
})
export class AlertsModule {}
