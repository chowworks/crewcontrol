import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { PhotosModule } from './photos/photos.module'
import { PrismaModule } from './prisma/prisma.module'
import { TripsModule } from './trips/trips.module'

@Module({
  imports: [PrismaModule, HealthModule, TripsModule, PhotosModule],
})
export class AppModule {}
