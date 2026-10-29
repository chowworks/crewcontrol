import { Module } from '@nestjs/common'
import {
  AdminController,
  PublicTripsController,
  RequestsController,
  SampleTripsController,
  TripsController,
} from './trips.controller'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { ExpensesService } from './expenses.service'
import { PeopleService } from './people.service'
import { TripsService } from './trips.service'

@Module({
  imports: [TermsModule, MessagingModule],
  controllers: [
    TripsController,
    PublicTripsController,
    SampleTripsController,
    AdminController,
    RequestsController,
  ],
  providers: [TripsService, PeopleService, ExpensesService],
  exports: [TripsService],
})
export class TripsModule {}
