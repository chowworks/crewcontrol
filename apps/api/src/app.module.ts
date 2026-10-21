import { Module } from '@nestjs/common'
import { ContactModule } from './contact/contact.module'
import { HealthModule } from './health/health.module'
import { PhotosModule } from './photos/photos.module'
import { PrismaModule } from './prisma/prisma.module'
import { TripsModule } from './trips/trips.module'

@Module({
  imports: [PrismaModule, HealthModule, TripsModule, PhotosModule, ContactModule],
})
export class AppModule {}
