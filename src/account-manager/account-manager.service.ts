import {
  Injectable,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { LoggingService } from '../logging/logging.service';

interface AccountInfo {
  dbId: string;
  credentials: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
  };
  projectId: string;
  oauth2Client: OAuth2Client;
  accessToken: string | null;
  tokenExpiry: number;
}

@Injectable()
export class AccountManagerService implements OnModuleInit {
  private readonly logger = new Logger(AccountManagerService.name);
  private accounts = new Map<string, AccountInfo>();
  private accountIds: string[] = [];
  private activeIndex = 0;
  private refreshPromises = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggingService: LoggingService,
  ) {}

  private static readonly BILLING_PHRASES = [
    'billing account not found',
    'free trial has expired',
    'billingnotenabled',
    'billing is not enabled',
    'billing disabled',
    'this api method requires billing',
    'cloud billing is not enabled',
    'project has been suspended',
    'the project to be billed is associated with an absent billing account',
  ];

  async onModuleInit() {
    await this.reloadAccounts();
  }

  async reloadAccounts() {
    const rows = await this.prisma.googleCredential.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    this.accounts.clear();
    this.accountIds = [];
    this.activeIndex = 0;
    this.refreshPromises.clear();

    for (const row of rows) {
      const oauth2Client = new OAuth2Client(row.clientId, row.clientSecret);
      oauth2Client.setCredentials({ refresh_token: row.refreshToken });

      this.accounts.set(row.name, {
        dbId: row.id,
        credentials: {
          client_id: row.clientId,
          client_secret: row.clientSecret,
          refresh_token: row.refreshToken,
        },
        projectId: row.quotaProjectId,
        oauth2Client,
        accessToken: null,
        tokenExpiry: 0,
      });
      this.accountIds.push(row.name);
      this.logger.log(
        `Loaded account: ${row.name} (project: ${row.quotaProjectId})`,
      );
    }

    if (this.accounts.size === 0) {
      this.logger.warn('No active credentials found in database');
    } else {
      this.logger.log(
        `Loaded ${this.accounts.size} active account(s). Active: ${this.accountIds[this.activeIndex]}`,
      );
    }

    this.loggingService.logApp({
      level: 'LOG',
      context: 'AccountManagerService',
      message: `Loaded ${this.accounts.size} active account(s)`,
      metadata: {
        type: 'accounts_reload',
        count: this.accounts.size,
        activeAccount: this.accountIds[this.activeIndex] || null,
      },
    });
  }

  async acquireAccount(): Promise<{
    id: string;
    token: string;
    projectId: string;
  }> {
    if (this.accountIds.length === 0) {
      throw new ServiceUnavailableException('No GCP accounts configured');
    }

    const id = this.accountIds[this.activeIndex];
    this.activeIndex = (this.activeIndex + 1) % this.accountIds.length;

    const account = this.accounts.get(id);
    if (!account) {
      throw new ServiceUnavailableException('All GCP accounts are exhausted');
    }

    const token = await this.ensureToken(id, account);
    return { id, token, projectId: account.projectId };
  }

  private async ensureToken(
    accountId: string,
    account: AccountInfo,
  ): Promise<string> {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (account.accessToken && account.tokenExpiry - now > fiveMinutes) {
      return account.accessToken;
    }

    const existing = this.refreshPromises.get(accountId);
    if (existing) {
      await existing;
      return account.accessToken!;
    }

    const promise = this.refreshToken(accountId, account);
    this.refreshPromises.set(accountId, promise);
    try {
      await promise;
    } finally {
      this.refreshPromises.delete(accountId);
    }

    return account.accessToken!;
  }

  private async refreshToken(
    accountId: string,
    account: AccountInfo,
  ): Promise<void> {
    this.logger.log(`Refreshing token for account: ${accountId}`);
    const { credentials } =
      await account.oauth2Client.refreshAccessToken();
    account.accessToken = credentials.access_token!;
    account.tokenExpiry = credentials.expiry_date || Date.now() + 3600 * 1000;
    this.logger.log(
      `Token refreshed for ${accountId}, expires at ${new Date(account.tokenExpiry).toISOString()}`,
    );

    this.loggingService.logApp({
      level: 'LOG',
      context: 'AccountManagerService',
      message: `Token refreshed for ${accountId}`,
      metadata: {
        type: 'token_refresh',
        accountId,
        expiresAt: new Date(account.tokenExpiry).toISOString(),
      },
    });
  }

  async handleBillingError(
    errorText: string,
    accountId: string,
  ): Promise<boolean> {
    const lower = (errorText || '').toLowerCase();
    const isBilling = AccountManagerService.BILLING_PHRASES.some((phrase) =>
      lower.includes(phrase),
    );

    if (!isBilling) return false;

    this.logger.warn(`Billing error on account ${accountId}: ${errorText}`);

    const account = this.accounts.get(accountId);
    if (account) {
      await this.prisma.googleCredential.update({
        where: { id: account.dbId },
        data: { active: false },
      });
      this.logger.warn(`Deactivated account ${accountId} in database`);
      this.accounts.delete(accountId);
      const idx = this.accountIds.indexOf(accountId);
      if (idx !== -1) {
        this.accountIds.splice(idx, 1);
        if (idx < this.activeIndex && this.activeIndex > 0) {
          this.activeIndex -= 1;
        }
      }
    }

    if (this.accountIds.length === 0) {
      throw new ServiceUnavailableException(
        'All GCP accounts are exhausted. No billing credits remaining.',
      );
    }

    this.activeIndex = this.activeIndex % this.accountIds.length;

    this.loggingService.logApp({
      level: 'WARN',
      context: 'AccountManagerService',
      message: `Account ${accountId} deactivated due to billing error`,
      metadata: {
        type: 'account_rotation',
        deactivatedAccount: accountId,
        remainingAccounts: this.accountIds.length,
        errorText: errorText.substring(0, 500),
      },
    });

    return true;
  }

  getAccountsStatus() {
    const nextId =
      this.accountIds.length > 0 ? this.accountIds[this.activeIndex] : null;

    const accounts = this.accountIds.map((id) => {
      const acc = this.accounts.get(id)!;
      return {
        id,
        projectId: acc.projectId,
        isNext: id === nextId,
      };
    });

    return {
      totalAccounts: this.accounts.size,
      nextAccountId: nextId,
      accounts,
    };
  }
}
