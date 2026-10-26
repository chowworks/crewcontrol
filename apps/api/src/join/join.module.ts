import { Module } from '@nestjs/common'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { JoinController } from './join.controller'
import { JoinService } from './join.service'

@Module({
  imports: [TripsModule, TermsModule],
  controllers: [JoinController],
  providers: [JoinService],
})
export class JoinModule {}
