import { Module } from '@nestjs/common'
import { PublicTripsController, TripsController } from './trips.controller'
import { TripsService } from './trips.service'

@Module({
  controllers: [TripsController, PublicTripsController],
  providers: [TripsService],
})
export class TripsModule {}
