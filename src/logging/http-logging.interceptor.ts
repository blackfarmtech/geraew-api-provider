import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { LoggingService } from './logging.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly loggingService: LoggingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const requestLogId = crypto.randomUUID();
    req['requestLogId'] = requestLogId;

    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      tap((responseBody) => {
        this.loggingService.logRequest({
          method: req.method,
          url: req.originalUrl,
          route: req.route?.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestHeaders: req.headers,
          requestBody: req.body,
          statusCode: res.statusCode,
          responseBody,
          durationMs: Date.now() - startTime,
          handler,
        });
      }),
      catchError((error) => {
        this.loggingService.logRequest({
          method: req.method,
          url: req.originalUrl,
          route: req.route?.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestHeaders: req.headers,
          requestBody: req.body,
          statusCode: error.status || error.getStatus?.() || 500,
          responseBody: error.response || null,
          durationMs: Date.now() - startTime,
          errorMessage: error.message,
          errorStack: error.stack,
          handler,
        });
        throw error;
      }),
    );
  }
}
