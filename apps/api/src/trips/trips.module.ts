import { Module } from '@nestjs/common'
import {
  AdminController,
  PublicTripsController,
  RequestsController,
  SampleTripsController,
  TripsController,
} from './trips.controller'
import { TermsModule } from '../terms/terms.module'
import { PeopleService } from './people.service'
import { TripsService } from './trips.service'

@Module({
  imports: [TermsModule],
  controllers: [
    TripsController,
    PublicTripsController,
    SampleTripsController,
    AdminController,
    RequestsController,
  ],
  providers: [TripsService, PeopleService],
  exports: [TripsService],
})
export class TripsModule {}
