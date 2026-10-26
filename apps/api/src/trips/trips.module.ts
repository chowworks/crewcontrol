import { Module } from '@nestjs/common'
import {
  AdminController,
  PublicTripsController,
  SampleTripsController,
  TripsController,
} from './trips.controller'
import { TermsModule } from '../terms/terms.module'
import { TripsService } from './trips.service'

@Module({
  imports: [TermsModule],
  controllers: [TripsController, PublicTripsController, SampleTripsController, AdminController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
