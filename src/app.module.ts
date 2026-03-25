import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { LoggingModule } from './logging/logging.module';
import { AccountManagerModule } from './account-manager/account-manager.module';
import { VertexModule } from './vertex/vertex.module';
import { VideoModule } from './video/video.module';
import { StatusModule } from './status/status.module';
import { CredentialsModule } from './credentials/credentials.module';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { CreditModule } from './credits/credits.module';
import { StripeModule } from './stripe/stripe.module';
import { CombinedAuthGuard } from './auth/guards/combined-auth.guard';
import { HttpLoggingInterceptor } from './logging/http-logging.interceptor';
import { AllExceptionsFilter } from './logging/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LoggingModule,
    AuthModule,
    AccountManagerModule,
    VertexModule,
    VideoModule,
    StatusModule,
    CredentialsModule,
    ApiKeysModule,
    CreditModule,
    StripeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
