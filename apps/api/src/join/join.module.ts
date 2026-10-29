import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { JoinController, MeController } from './join.controller'
import { JoinService } from './join.service'

@Module({
  imports: [TripsModule, TermsModule, MessagingModule],
  controllers: [JoinController, MeController],
  providers: [JoinService],
})
export class JoinModule {}
