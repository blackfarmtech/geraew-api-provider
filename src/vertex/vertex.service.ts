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
    extraHeaders?: Record<string, string>,
    forceProjectId?: string,
  ): Promise<any> {
    const { data } = await this.proxyRequestDetailed(
      method,
      path,
      body,
      location,
      useRegionalEndpoint,
      requestLogId,
      extraHeaders,
      forceProjectId,
    );
    return data;
  }

  /**
   * Igual a `proxyRequest`, mas devolve também qual projeto/conta GCP atendeu a
   * chamada. Use quando precisar amarrar chamadas subsequentes ao mesmo projeto
   * (operações stateful como as interações do Gemini Omni).
   *
   * Quando `forceProjectId` é informado, a chamada NÃO faz round-robin: usa a
   * conta daquele projeto específico. Nesse modo, um erro de billing não pode
   * ser resolvido trocando de conta (a operação vive em outro projeto), então
   * falha explicitamente em vez de rotacionar.
   */
  async proxyRequestDetailed(
    method: string,
    path: string,
    body: any,
    location: string,
    useRegionalEndpoint = false,
    requestLogId?: string,
    extraHeaders?: Record<string, string>,
    forceProjectId?: string,
  ): Promise<{ data: any; projectId: string; accountId: string }> {
    for (let attempt = 1; attempt <= VertexService.MAX_RETRIES; attempt++) {
      const { id: accountId, token, projectId } = forceProjectId
        ? await this.accountManager.acquireAccountByProject(forceProjectId)
        : await this.accountManager.acquireAccount();
      const resolvedPath = path.replace(/\{PROJECT_ID\}/g, projectId);
      const baseUrl = useRegionalEndpoint
        ? `https://${location}-aiplatform.googleapis.com`
        : `https://aiplatform.googleapis.com`;
      const url = `${baseUrl}${resolvedPath}`;
      const startTime = Date.now();

      this.logger.log(
        `[attempt ${attempt}] account=${accountId} ${method.toUpperCase()} ${url}`,
      );

      try {
        const response = await axios({
          method,
          url,
          data: body || undefined,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            // Quota/resource project. Obrigatório em endpoints globais cujo path
            // NÃO carrega o projeto (ex.: interactions/{id}:poll). Sem isso o
            // Vertex responde 400 RESOURCE_PROJECT_INVALID. No create (projeto no
            // path) é redundante mas coerente — sempre o mesmo projeto.
            'x-goog-user-project': projectId,
            ...extraHeaders,
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
            accountId,
            method: method.toUpperCase(),
            url,
            durationMs,
            statusCode: response.status,
            responseKeys: response.data ? Object.keys(response.data) : null,
          },
          requestLogId,
        });

        return { data: response.data, projectId, accountId };
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
            accountId,
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
          `Request failed (attempt ${attempt}, account=${accountId}): status=${status} error=${errorText.substring(0, 200)}`,
        );

        if (status === 403 || status === 429) {
          const isBilling = await this.accountManager.handleBillingError(
            errorText,
            accountId,
          );
          // Com projeto fixo (poll de operação stateful) não adianta rotacionar:
          // a operação vive naquele projeto. Propaga o erro em vez de tentar
          // outra conta que não conhece essa operação.
          if (isBilling && !forceProjectId) {
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
