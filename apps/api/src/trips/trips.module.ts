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
import { MembershipsModule } from '../memberships/memberships.module'
import { TermsModule } from '../terms/terms.module'
import { ExpensesService } from './expenses.service'
import { PaymentNoticesService } from './payment-notices.service'
import { PeopleService } from './people.service'
import { RoomPlanService } from './room-plan.service'
import { TripDeletionService } from './trip-deletion.service'
import { TripExportService } from './trip-export.service'
import { TripsService } from './trips.service'

@Module({
  imports: [TermsModule, MessagingModule, MembershipsModule],
  controllers: [
    TripsController,
    PublicTripsController,
    PublicSettingsController,
    SampleTripsController,
    AdminController,
    RequestsController,
  ],
  providers: [
    TripsService,
    PeopleService,
    ExpensesService,
    TripDeletionService,
    TripExportService,
    PaymentNoticesService,
    RoomPlanService,
  ],
  exports: [TripsService],
})
export class TripsModule {}
