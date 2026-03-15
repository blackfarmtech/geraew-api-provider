import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LoggingService } from './logging.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly loggingService: LoggingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : String(exception);

    const stack = exception instanceof Error ? exception.stack : undefined;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Internal server error' };

    this.loggingService.logApp({
      level: 'ERROR',
      context: 'AllExceptionsFilter',
      message: `${request.method} ${request.originalUrl} -> ${status}: ${message}`,
      metadata: {
        method: request.method,
        url: request.originalUrl,
        statusCode: status,
        errorResponse,
      },
      errorStack: stack,
      requestLogId: request['requestLogId'],
    });

    const body =
      typeof errorResponse === 'string'
        ? { statusCode: status, message: errorResponse }
        : errorResponse;

    response.status(status).json(body);
  }
}
