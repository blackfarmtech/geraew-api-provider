import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import { AccountManagerService } from '../account-manager/account-manager.service';

@Injectable()
export class VertexService {
  private readonly logger = new Logger(VertexService.name);
  private static readonly MAX_RETRIES = 3;

  constructor(private readonly accountManager: AccountManagerService) { }

  async proxyRequest(
    method: string,
    path: string,
    body: any,
    location: string,
    useRegionalEndpoint = false,
  ): Promise<any> {
    for (let attempt = 1; attempt <= VertexService.MAX_RETRIES; attempt++) {
      const projectId = this.accountManager.getProjectId();
      const resolvedPath = path.replace(/\{PROJECT_ID\}/g, projectId);
      const baseUrl = useRegionalEndpoint
        ? `https://${location}-aiplatform.googleapis.com`
        : `https://aiplatform.googleapis.com`;
      const url = `${baseUrl}${resolvedPath}`;
      const token = await this.accountManager.getToken();

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
          timeout: 120_000,
        });

        console.log(response.data);
        return response.data;
      } catch (error) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        const errorText = JSON.stringify(errorData || '');

        this.logger.warn(
          `Request failed (attempt ${attempt}): status=${status} error=${errorText.substring(0, 200)}`,
        );

        if (status === 403 || status === 429) {
          const isBilling =
            this.accountManager.handleBillingError(errorText);
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
