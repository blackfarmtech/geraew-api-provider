import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity } from '@nestjs/swagger';
import { Request } from 'express';
import { VideoService } from './video.service';
import { GenerateVideoWithReferencesDto } from './dto/generate-video-with-references.dto';
import { GenerateVideoTextToVideoDto } from './dto/generate-video-text-to-video.dto';
import { GenerateVideoImageToVideoDto } from './dto/generate-video-image-to-video.dto';
import { GenerateVideoOmniDto } from './dto/generate-video-omni.dto';

@ApiTags('Video')
@ApiSecurity('x-api-key')
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('generate-text-to-video')
  @ApiOperation({ summary: 'Gerar vídeo', description: 'Gera um vídeo a partir de um prompt de texto. Modos suportados: text-to-video, image-to-video (image_base64 como primeiro frame), first+last frame (image_base64 + last_frame_base64), imagens de referência asset (até 3 imagens do mesmo sujeito) e style (1 imagem de estilo, apenas veo-2.0-generate-001). Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateTextToVideo(@Body() dto: GenerateVideoTextToVideoDto, @Req() req: Request) {
    return this.videoService.generateVideoTextToVideo(dto, req['requestLogId']);
  }

  @Post('generate-image-to-video')
  @ApiOperation({ summary: 'Gerar vídeo', description: 'Gera um vídeo a partir de um prompt de texto. Modos suportados: text-to-video, image-to-video (image_base64 como primeiro frame), first+last frame (image_base64 + last_frame_base64), imagens de referência asset (até 3 imagens do mesmo sujeito) e style (1 imagem de estilo, apenas veo-2.0-generate-001). Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateImageToVideo(@Body() dto: GenerateVideoImageToVideoDto, @Req() req: Request) {
    return this.videoService.generateVideoImageToVideo(dto, req['requestLogId']);
  }

  @Post('generate-references')
  @ApiOperation({ summary: 'Gerar vídeo', description: 'Gera um vídeo a partir de um prompt de texto. Modos suportados: text-to-video, image-to-video (image_base64 como primeiro frame), first+last frame (image_base64 + last_frame_base64), imagens de referência asset (até 3 imagens do mesmo sujeito) e style (1 imagem de estilo, apenas veo-2.0-generate-001). Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generate(@Body() dto: GenerateVideoWithReferencesDto, @Req() req: Request) {
    return this.videoService.generateVideoWithRefereces(dto, req['requestLogId']);
  }

  @Post('generate-omni')
  @ApiOperation({ summary: 'Gerar vídeo (Gemini Omni Flash)', description: 'Gera ou edita vídeo com o gemini-omni-flash-preview via Interactions API. Modos: text-to-video (só prompt), image-to-video (first_frame em base64), reference-to-video (images[] com 2+ imagens) e edit (video_base64 de um vídeo a ser editado). Retorna um operationName no formato interactions/<id> para polling no endpoint /video/status. Obs.: previous_interaction_id (edição conversacional stateful) não é suportado neste path do Vertex.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'interactions/v1_abc123', interactionId: 'v1_abc123' } } })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateOmni(@Body() dto: GenerateVideoOmniDto, @Req() req: Request) {
    return this.videoService.generateVideoOmni(dto, req['requestLogId']);
  }

  @Post('status')
  @ApiOperation({ summary: 'Consultar status de geração', description: 'Consulta o status de uma operação de geração de vídeo. Use o operationName retornado pelo endpoint de geração.' })
  @ApiBody({ schema: { type: 'object', properties: { operationName: { type: 'string', description: 'Nome da operação retornado pelo endpoint de geração', example: 'projects/.../operations/uuid' } }, required: ['operationName'] } })
  @ApiResponse({ status: 201, description: 'Status da operação', schema: { example: { done: true, operationName: 'projects/.../operations/uuid', videos: [{ base64: '...', mimeType: 'video/mp4' }] } } })
  async getStatus(@Body('operationName') operationName: string, @Req() req: Request) {
    return this.videoService.getVideoStatus(operationName, req['requestLogId']);
  }
}
