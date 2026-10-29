import { Module } from '@nestjs/common'
import { TermsModule } from '../terms/terms.module'
import { TripsModule } from '../trips/trips.module'
import { ForwardedReceiptsService } from './forwarded-receipts.service'
import { AdminReceiptsController, ReceiptsController } from './receipts.controller'

@Module({
  imports: [TripsModule, TermsModule],
  controllers: [ReceiptsController, AdminReceiptsController],
  providers: [ForwardedReceiptsService],
})
export class ReceiptsModule {}
