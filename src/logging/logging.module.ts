import { Global, Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { DatabaseLogger } from './database.logger';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Global()
@Module({
  providers: [
    LoggingService,
    DatabaseLogger,
    HttpLoggingInterceptor,
    AllExceptionsFilter,
  ],
  exports: [
    LoggingService,
    DatabaseLogger,
    HttpLoggingInterceptor,
    AllExceptionsFilter,
  ],
})
export class LoggingModule {}
