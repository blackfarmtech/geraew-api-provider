import {
  Injectable,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

interface AccountInfo {
  credentials: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
  };
  projectId: string;
  oauth2Client: OAuth2Client;
  isExhausted: boolean;
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
    this.loadAccounts();
    if (this.accounts.size === 0) {
      this.logger.warn('No credential files found in credentials/');
    } else {
      this.logger.log(
        `Loaded ${this.accounts.size} account(s). Active: ${this.accountIds[this.activeIndex]}`,
      );
    }
  }

  private loadAccounts() {
    const credentialsDir = path.join(process.cwd(), 'credentials');
    if (!fs.existsSync(credentialsDir)) {
      this.logger.warn('credentials/ directory not found');
      return;
    }

    const files = fs
      .readdirSync(credentialsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      const filePath = path.join(credentialsDir, file);
      const creds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const projectId = creds.quota_project_id;

      if (!projectId) {
        this.logger.warn(`No quota_project_id in ${file}, skipping`);
        continue;
      }

      if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
        this.logger.warn(`Invalid credentials in ${file}, skipping`);
        continue;
      }

      const oauth2Client = new OAuth2Client(
        creds.client_id,
        creds.client_secret,
      );
      oauth2Client.setCredentials({ refresh_token: creds.refresh_token });

      const accountId = path.basename(file, '.json');
      this.accounts.set(accountId, {
        credentials: creds,
        projectId,
        oauth2Client,
        isExhausted: false,
        accessToken: null,
        tokenExpiry: 0,
      });
      this.accountIds.push(accountId);
      this.logger.log(`Loaded account: ${accountId} (project: ${projectId})`);
    }
  }

  private getActiveAccount(): AccountInfo {
    if (this.accountIds.length === 0) {
      throw new ServiceUnavailableException('No GCP accounts configured');
    }
    const id = this.accountIds[this.activeIndex];
    const account = this.accounts.get(id);
    if (!account || account.isExhausted) {
      throw new ServiceUnavailableException('All GCP accounts are exhausted');
    }
    return account;
  }

  async getToken(): Promise<string> {
    const account = this.getActiveAccount();
    const accountId = this.accountIds[this.activeIndex];
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (account.accessToken && account.tokenExpiry - now > fiveMinutes) {
      return account.accessToken;
    }

    const existing = this.refreshPromises.get(accountId);
    if (existing) {
      await existing;
      return this.getActiveAccount().accessToken!;
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
  }

  getProjectId(): string {
    return this.getActiveAccount().projectId;
  }

  handleBillingError(errorText: string): boolean {
    const lower = (errorText || '').toLowerCase();
    const isBilling = AccountManagerService.BILLING_PHRASES.some((phrase) =>
      lower.includes(phrase),
    );

    if (!isBilling) return false;

    const currentId = this.accountIds[this.activeIndex];
    this.logger.warn(`Billing error on account ${currentId}: ${errorText}`);

    const account = this.accounts.get(currentId);
    if (account) account.isExhausted = true;

    for (let i = 0; i < this.accountIds.length; i++) {
      const id = this.accountIds[i];
      const acc = this.accounts.get(id)!;
      if (!acc.isExhausted) {
        this.activeIndex = i;
        this.logger.log(`Rotated to account: ${id}`);
        return true;
      }
    }

    throw new ServiceUnavailableException(
      'All GCP accounts are exhausted. No billing credits remaining.',
    );
  }

  getAccountsStatus() {
    const activeId =
      this.accountIds.length > 0
        ? this.accountIds[this.activeIndex]
        : null;

    const accounts = this.accountIds.map((id) => {
      const acc = this.accounts.get(id)!;
      return {
        id,
        projectId: acc.projectId,
        isExhausted: acc.isExhausted,
        isActive: id === activeId,
      };
    });

    return {
      totalAccounts: this.accounts.size,
      activeAccountId: activeId,
      exhaustedCount: accounts.filter((a) => a.isExhausted).length,
      availableCount: accounts.filter((a) => !a.isExhausted).length,
      accounts,
    };
  }
}
