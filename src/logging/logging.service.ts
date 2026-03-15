import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoggingService implements OnModuleInit, OnModuleDestroy {
  private requestLogBuffer: any[] = [];
  private appLogBuffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;

  private readonly FLUSH_INTERVAL_MS = 2000;
  private readonly MAX_BUFFER_SIZE = 50;
  private readonly RETENTION_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    // Run retention cleanup once per day
    this.retentionTimer = setInterval(
      () => this.cleanOldLogs(),
      24 * 60 * 60 * 1000,
    );
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.flush();
  }

  logRequest(data: {
    method: string;
    url: string;
    route?: string;
    ip?: string;
    userAgent?: string;
    requestHeaders?: Record<string, any>;
    requestBody?: any;
    statusCode?: number;
    responseBody?: any;
    durationMs?: number;
    errorMessage?: string;
    errorStack?: string;
    handler?: string;
    accountId?: string;
  }): void {
    const sanitized = this.sanitizeRequestData(data);
    this.requestLogBuffer.push(sanitized);
    if (this.requestLogBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  logApp(data: {
    level: string;
    context?: string;
    message: string;
    metadata?: any;
    errorStack?: string;
    requestLogId?: string;
  }): void {
    this.appLogBuffer.push(data);
    if (this.appLogBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    const requests = this.requestLogBuffer.splice(0);
    const appLogs = this.appLogBuffer.splice(0);

    try {
      if (requests.length > 0) {
        await this.prisma.requestLog.createMany({ data: requests });
      }
      if (appLogs.length > 0) {
        await this.prisma.appLog.createMany({ data: appLogs });
      }
    } catch (err) {
      console.error('[LoggingService] Failed to flush logs to DB:', err.message);
    }
  }

  private async cleanOldLogs(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);

    try {
      const deletedRequests = await this.prisma.requestLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      const deletedAppLogs = await this.prisma.appLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      console.log(
        `[LoggingService] Retention cleanup: deleted ${deletedRequests.count} request logs, ${deletedAppLogs.count} app logs`,
      );
    } catch (err) {
      console.error('[LoggingService] Retention cleanup failed:', err.message);
    }
  }

  private sanitizeRequestData(data: any): any {
    const clone = { ...data };
    if (clone.requestHeaders) {
      const headers = { ...clone.requestHeaders };
      delete headers['authorization'];
      delete headers['x-api-key'];
      clone.requestHeaders = headers;
    }
    clone.requestBody = this.truncateBase64Fields(clone.requestBody);
    clone.responseBody = this.truncateBase64Fields(clone.responseBody);
    return clone;
  }

  private truncateBase64Fields(obj: any, maxLen = 200): any {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(result)) {
      if (
        typeof result[key] === 'string' &&
        result[key].length > 1000 &&
        this.looksLikeBase64(result[key])
      ) {
        result[key] =
          result[key].substring(0, maxLen) +
          `...[truncated, ${result[key].length} chars]`;
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.truncateBase64Fields(result[key], maxLen);
      }
    }
    return result;
  }

  private looksLikeBase64(s: string): boolean {
    return /^[A-Za-z0-9+/=]{100,}$/.test(s.substring(0, 200));
  }
}
