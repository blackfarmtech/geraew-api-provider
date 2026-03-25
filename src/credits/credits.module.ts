import { Global, Module } from '@nestjs/common';
import { CreditService } from './credits.service';
import { CreditController } from './credits.controller';

@Global()
@Module({
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
