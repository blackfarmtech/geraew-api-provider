import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { CredentialsService } from './credentials.service';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

@ApiTags('Credentials')
@ApiSecurity('x-api-key')
@Controller('credentials')
export class CredentialsController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly accountManager: AccountManagerService,
  ) {}

  @Get()
  findAll() {
    return this.credentialsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateCredentialDto) {
    const credential = await this.credentialsService.create(dto);
    await this.accountManager.reloadAccounts();
    return { id: credential.id, name: credential.name };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.credentialsService.remove(id);
    await this.accountManager.reloadAccounts();
    return { deleted: true };
  }
}
