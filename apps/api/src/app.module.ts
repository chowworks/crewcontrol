import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ContactModule } from './contact/contact.module'
import { TenantMiddleware } from './core/tenant.middleware'
import { HealthModule } from './health/health.module'
import { PhotosModule } from './photos/photos.module'
import { PrismaModule } from './prisma/prisma.module'
import { TripsModule } from './trips/trips.module'

@Module({
  imports: [PrismaModule, HealthModule, TripsModule, PhotosModule, ContactModule],
})
export class AppModule implements NestModule {
  // Every request starts with an empty tenant context (docs/tenant-isolation.md).
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*')
  }
}
