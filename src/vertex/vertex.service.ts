import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class VertexService {
  private readonly logger = new Logger(VertexService.name);
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly accountManager: AccountManagerService,
    private readonly loggingService: LoggingService,
  ) {}

  async proxyRequest(
    method: string,
    path: string,
    body: any,
    location: string,
    useRegionalEndpoint = false,
    requestLogId?: string,
  ): Promise<any> {
    for (let attempt = 1; attempt <= VertexService.MAX_RETRIES; attempt++) {
      const projectId = this.accountManager.getProjectId();
      const resolvedPath = path.replace(/\{PROJECT_ID\}/g, projectId);
      const baseUrl = useRegionalEndpoint
        ? `https://${location}-aiplatform.googleapis.com`
        : `https://aiplatform.googleapis.com`;
      const url = `${baseUrl}${resolvedPath}`;
      const token = await this.accountManager.getToken();
      const startTime = Date.now();

      this.logger.log(
        `[attempt ${attempt}] ${method.toUpperCase()} ${url}`,
      );

      try {
        const response = await axios({
          method,
          url,
          data: body || undefined,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 800_000,
        });

        const durationMs = Date.now() - startTime;

        this.loggingService.logApp({
          level: 'LOG',
          context: 'VertexService',
          message: `Vertex AI call succeeded: ${method.toUpperCase()} ${url} (${durationMs}ms)`,
          metadata: {
            type: 'vertex_api_call',
            attempt,
            method: method.toUpperCase(),
            url,
            durationMs,
            statusCode: response.status,
            responseKeys: response.data ? Object.keys(response.data) : null,
          },
          requestLogId,
        });

        return response.data;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const status = error.response?.status;
        const errorData = error.response?.data;
        const errorText = JSON.stringify(errorData || '');

        this.loggingService.logApp({
          level: 'ERROR',
          context: 'VertexService',
          message: `Vertex AI call failed: ${method.toUpperCase()} ${url} status=${status} (${durationMs}ms, attempt ${attempt})`,
          metadata: {
            type: 'vertex_api_call',
            attempt,
            method: method.toUpperCase(),
            url,
            durationMs,
            statusCode: status,
            errorData,
          },
          errorStack: error.stack,
          requestLogId,
        });

        this.logger.warn(
          `Request failed (attempt ${attempt}): status=${status} error=${errorText.substring(0, 200)}`,
        );

        if (status === 403 || status === 429) {
          const isBilling =
            await this.accountManager.handleBillingError(errorText);
          if (isBilling) {
            this.logger.log('Billing error detected, retrying with next account');
            continue;
          }
          throw new HttpException(
            errorData?.error?.message || 'Forbidden',
            403,
          );
        }

        throw new HttpException(
          errorData?.error?.message || 'Vertex AI request failed',
          status || 502,
        );
      }
    }

    throw new HttpException('Max retries exceeded', 502);
  }
}
