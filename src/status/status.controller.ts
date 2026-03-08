import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { AccountManagerService } from '../account-manager/account-manager.service';

@ApiTags('Status')
@ApiSecurity('x-api-key')
@Controller('status')
export class StatusController {
  constructor(private readonly accountManager: AccountManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Status das contas GCP', description: 'Retorna o status de todas as contas GCP configuradas, incluindo qual está ativa e quais estão esgotadas.' })
  @ApiResponse({ status: 200, description: 'Status das contas', schema: { example: { totalAccounts: 3, activeAccountId: 'account-1', exhaustedCount: 1, availableCount: 2, accounts: [{ id: 'account-1', projectId: 'my-project', isExhausted: false, isActive: true }] } } })
  getStatus() {
    return this.accountManager.getAccountsStatus();
  }
}
