import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import {
  AdminInterestController,
  InterestController,
  MyInterestController,
} from './interest.controller'
import { InterestService } from './interest.service'

@Module({
  imports: [TripsModule, MessagingModule, TermsModule],
  controllers: [InterestController, MyInterestController, AdminInterestController],
  providers: [InterestService],
})
export class InterestModule {}
