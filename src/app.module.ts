import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AccountManagerModule } from './account-manager/account-manager.module';
import { VertexModule } from './vertex/vertex.module';
import { VideoModule } from './video/video.module';
import { ImageModule } from './image/image.module';
import { StatusModule } from './status/status.module';
import { ApiKeyGuard } from './auth/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AccountManagerModule,
    VertexModule,
    VideoModule,
    ImageModule,
    StatusModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
