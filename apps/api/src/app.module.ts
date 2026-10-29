import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { ContactModule } from './contact/contact.module'
import { TenantMiddleware } from './core/tenant.middleware'
import { HealthModule } from './health/health.module'
import { JoinModule } from './join/join.module'
import { MessagingModule } from './messaging/messaging.module'
import { PhotosModule } from './photos/photos.module'
import { PrismaModule } from './prisma/prisma.module'
import { RemindersModule } from './reminders/reminders.module'
import { TermsModule } from './terms/terms.module'
import { TripsModule } from './trips/trips.module'

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    HealthModule,
    TripsModule,
    JoinModule,
    PhotosModule,
    ContactModule,
    TermsModule,
    MessagingModule,
    RemindersModule,
  ],
})
export class AppModule implements NestModule {
  // Every request starts with an empty tenant context (docs/tenant-isolation.md).
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*')
  }
}
