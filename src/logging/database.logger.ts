import { Injectable, LoggerService } from '@nestjs/common';
import { LoggingService } from './logging.service';

@Injectable()
export class DatabaseLogger implements LoggerService {
  constructor(private readonly loggingService: LoggingService) {}

  log(message: any, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.log(`[${context || 'App'}] ${msg}`);
    this.loggingService.logApp({ level: 'LOG', context, message: msg });
  }

  error(message: any, trace?: string, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.error(`[${context || 'App'}] ${msg}`, trace || '');
    this.loggingService.logApp({
      level: 'ERROR',
      context,
      message: msg,
      errorStack: trace,
    });
  }

  warn(message: any, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.warn(`[${context || 'App'}] ${msg}`);
    this.loggingService.logApp({ level: 'WARN', context, message: msg });
  }

  debug(message: any, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.loggingService.logApp({ level: 'DEBUG', context, message: msg });
  }

  verbose(message: any, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.loggingService.logApp({ level: 'VERBOSE', context, message: msg });
  }
}
