import { Global, Module } from '@nestjs/common';
import { AccountManagerService } from './account-manager.service';

@Global()
@Module({
  providers: [AccountManagerService],
  exports: [AccountManagerService],
})
export class AccountManagerModule {}
