import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { InterestController, MyInterestController } from './interest.controller'
import { InterestService } from './interest.service'

@Module({
  imports: [TripsModule, MessagingModule, TermsModule],
  controllers: [InterestController, MyInterestController],
  providers: [InterestService],
})
export class InterestModule {}
