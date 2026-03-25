import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CreditService } from './credits.service';

class EstimateCostDto {
  model?: string;
  resolution?: string;
  duration_seconds?: number;
  sample_count?: number;
  generate_audio?: boolean;
}

@ApiTags('Credits')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@Controller('credits')
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get current credit balance and auto-recharge config' })
  getBalance(@Req() req) {
    return this.creditService.getBalance(req.user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get credit transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTransactions(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creditService.getTransactions(
      req.user.id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Get active credit pricing table' })
  getPricing() {
    return this.creditService.getPricing();
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimate credit cost for a video generation' })
  async estimateCost(@Body() dto: EstimateCostDto) {
    const cost = await this.creditService.calculateCost({
      model: dto.model || 'veo-3.1-generate-preview',
      resolution: dto.resolution || '720p',
      durationSeconds: dto.duration_seconds || 8,
      sampleCount: dto.sample_count || 1,
      generateAudio: dto.generate_audio,
    });
    return { estimatedCost: cost };
  }
}
