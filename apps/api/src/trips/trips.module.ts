import { Module } from '@nestjs/common'
import {
  AdminController,
  PublicSettingsController,
  PublicTripsController,
  RequestsController,
  SampleTripsController,
  TripsController,
} from './trips.controller'
import { MessagingModule } from '../messaging/messaging.module'
import { TermsModule } from '../terms/terms.module'
import { ExpensesService } from './expenses.service'
import { PeopleService } from './people.service'
import { TripDeletionService } from './trip-deletion.service'
import { TripExportService } from './trip-export.service'
import { TripsService } from './trips.service'

@Module({
  imports: [TermsModule, MessagingModule],
  controllers: [
    TripsController,
    PublicTripsController,
    PublicSettingsController,
    SampleTripsController,
    AdminController,
    RequestsController,
  ],
  providers: [TripsService, PeopleService, ExpensesService, TripDeletionService, TripExportService],
  exports: [TripsService],
})
export class TripsModule {}
