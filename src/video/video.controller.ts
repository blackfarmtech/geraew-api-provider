import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity, ApiBearerAuth } from '@nestjs/swagger';
import { VideoService } from './video.service';
import { GenerateVideoWithReferencesDto } from './dto/generate-video-with-references.dto';
import { GenerateVideoTextToVideoDto } from './dto/generate-video-text-to-video.dto';
import { GenerateVideoImageToVideoDto } from './dto/generate-video-image-to-video.dto';
import { CreditService } from '../credits/credits.service';
import { StripeService } from '../stripe/stripe.service';

@ApiTags('Video')
@ApiSecurity('x-api-key')
@ApiBearerAuth()
@Controller('video')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly creditService: CreditService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('generate-text-to-video')
  @ApiOperation({ summary: 'Gerar vídeo a partir de texto', description: 'Gera um vídeo a partir de um prompt de texto. Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 402, description: 'Créditos insuficientes' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateTextToVideo(@Body() dto: GenerateVideoTextToVideoDto, @Req() req) {
    const user = req['user'];

    const { cost, deductionTx } = await this.handleCreditDeduction(user, dto);

    try {
      return await this.videoService.generateVideoTextToVideo(dto, req['requestLogId']);
    } catch (error) {
      if (deductionTx) {
        await this.creditService.addCredits(user.id, cost, 'refund', `Refund: generation failed - ${error.message}`);
      }
      throw error;
    }
  }

  @Post('generate-image-to-video')
  @ApiOperation({ summary: 'Gerar vídeo a partir de imagem', description: 'Gera um vídeo a partir de uma imagem (primeiro frame) e prompt de texto. Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 402, description: 'Créditos insuficientes' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateImageToVideo(@Body() dto: GenerateVideoImageToVideoDto, @Req() req) {
    const user = req['user'];

    const { cost, deductionTx } = await this.handleCreditDeduction(user, dto);

    try {
      return await this.videoService.generateVideoImageToVideo(dto, req['requestLogId']);
    } catch (error) {
      if (deductionTx) {
        await this.creditService.addCredits(user.id, cost, 'refund', `Refund: generation failed - ${error.message}`);
      }
      throw error;
    }
  }

  @Post('generate-references')
  @ApiOperation({ summary: 'Gerar vídeo com referências', description: 'Gera um vídeo com imagens de referência (asset ou style). Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 402, description: 'Créditos insuficientes' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generate(@Body() dto: GenerateVideoWithReferencesDto, @Req() req) {
    const user = req['user'];

    const { cost, deductionTx } = await this.handleCreditDeduction(user, dto);

    try {
      return await this.videoService.generateVideoWithRefereces(dto, req['requestLogId']);
    } catch (error) {
      if (deductionTx) {
        await this.creditService.addCredits(user.id, cost, 'refund', `Refund: generation failed - ${error.message}`);
      }
      throw error;
    }
  }

  @Post('status')
  @ApiOperation({ summary: 'Consultar status de geração', description: 'Consulta o status de uma operação de geração de vídeo.' })
  @ApiBody({ schema: { type: 'object', properties: { operationName: { type: 'string', description: 'Nome da operação retornado pelo endpoint de geração', example: 'projects/.../operations/uuid' } }, required: ['operationName'] } })
  @ApiResponse({ status: 201, description: 'Status da operação', schema: { example: { done: true, operationName: 'projects/.../operations/uuid', videos: [{ base64: '...', mimeType: 'video/mp4' }] } } })
  async getStatus(@Body('operationName') operationName: string, @Req() req) {
    return this.videoService.getVideoStatus(operationName, req['requestLogId']);
  }

  private async handleCreditDeduction(
    user: { id: string; role: string },
    dto: { model?: string; resolution?: string; duration_seconds?: number; sample_count?: number; generate_audio?: boolean },
  ) {
    // Admin users bypass credit checks
    if (user.role === 'admin') {
      return { cost: 0, deductionTx: null };
    }

    const cost = await this.creditService.calculateCost({
      model: dto.model || 'veo-3.1-generate-preview',
      resolution: dto.resolution || '720p',
      durationSeconds: dto.duration_seconds || 8,
      sampleCount: dto.sample_count || 1,
      generateAudio: dto.generate_audio,
    });

    const deductionTx = await this.creditService.deductCredits(
      user.id,
      cost,
      `Video generation: ${dto.model || 'veo-3.1-generate-preview'}`,
      {
        model: dto.model,
        resolution: dto.resolution,
        durationSeconds: dto.duration_seconds,
        sampleCount: dto.sample_count,
      },
    );

    // Trigger auto-recharge check (non-blocking)
    this.triggerAutoRechargeIfNeeded(user.id);

    return { cost, deductionTx };
  }

  private async triggerAutoRechargeIfNeeded(userId: string) {
    try {
      const needs = await this.creditService.needsAutoRecharge(userId);
      if (needs) {
        this.stripeService.chargeAutoRecharge(userId).catch(() => {});
      }
    } catch {
      // Non-blocking, ignore errors
    }
  }
}
