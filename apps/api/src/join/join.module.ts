import { Module } from '@nestjs/common'
import { TripsModule } from '../trips/trips.module'
import { JoinController } from './join.controller'
import { JoinService } from './join.service'

@Module({
  imports: [TripsModule],
  controllers: [JoinController],
  providers: [JoinService],
})
export class JoinModule {}
