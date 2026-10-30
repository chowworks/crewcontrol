import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { AnnouncementsController, GuestAnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'

@Module({
  imports: [TripsModule, MessagingModule, TermsModule],
  controllers: [AnnouncementsController, GuestAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
