import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { AskChangesController, ChangesController } from './changes.controller'
import { ChangesService } from './changes.service'

@Module({
  imports: [TripsModule, MessagingModule, TermsModule],
  controllers: [ChangesController, AskChangesController],
  providers: [ChangesService],
})
export class ChangesModule {}
