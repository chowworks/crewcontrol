import { Module } from '@nestjs/common'
import { TripsModule } from '../trips/trips.module'
import { JoinController, MeController } from './join.controller'
import { JoinService } from './join.service'

@Module({
  imports: [TripsModule],
  controllers: [JoinController, MeController],
  providers: [JoinService],
})
export class JoinModule {}
