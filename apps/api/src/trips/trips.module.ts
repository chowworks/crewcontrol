import { Module } from '@nestjs/common'
import { PublicTripsController, SampleTripsController, TripsController } from './trips.controller'
import { TripsService } from './trips.service'

@Module({
  controllers: [TripsController, PublicTripsController, SampleTripsController],
  providers: [TripsService],
})
export class TripsModule {}
