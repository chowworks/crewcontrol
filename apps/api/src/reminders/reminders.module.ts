import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { RemindersController, StopUpdatesController } from './reminders.controller'
import { RemindersService } from './reminders.service'

@Module({
  imports: [AuthModule, TripsModule, MessagingModule, TermsModule],
  controllers: [RemindersController, StopUpdatesController],
  providers: [RemindersService],
})
export class RemindersModule {}
