import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  create(@Req() req, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(req.user.id, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys (masked)' })
  findAll(@Req() req) {
    return this.apiKeysService.findAllByUser(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Req() req, @Param('id') id: string) {
    return this.apiKeysService.revoke(req.user.id, id);
  }
}
