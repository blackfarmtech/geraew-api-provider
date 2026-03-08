import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AccountManagerModule } from './account-manager/account-manager.module';
import { VertexModule } from './vertex/vertex.module';
import { VideoModule } from './video/video.module';
import { ImageModule } from './image/image.module';
import { StatusModule } from './status/status.module';
import { CredentialsModule } from './credentials/credentials.module';
import { ApiKeyGuard } from './auth/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccountManagerModule,
    VertexModule,
    VideoModule,
    ImageModule,
    StatusModule,
    CredentialsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
