import { Module } from '@nestjs/common'
import {
  AdminController,
  PublicTripsController,
  SampleTripsController,
  TripsController,
} from './trips.controller'
import { TripsService } from './trips.service'

@Module({
  controllers: [TripsController, PublicTripsController, SampleTripsController, AdminController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
