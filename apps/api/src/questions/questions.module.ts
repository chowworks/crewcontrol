import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { AskQuestionsController, QuestionsController } from './questions.controller'
import { QuestionsService } from './questions.service'

@Module({
  imports: [TripsModule, MessagingModule, TermsModule],
  controllers: [QuestionsController, AskQuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
