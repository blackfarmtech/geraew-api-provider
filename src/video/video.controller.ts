import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity } from '@nestjs/swagger';
import { VideoService } from './video.service';
import { GenerateVideoDto } from './dto/generate-video.dto';

@ApiTags('Video')
@ApiSecurity('x-api-key')
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) { }

  @Post('generate')
  @ApiOperation({ summary: 'Gerar vídeo', description: 'Gera um vídeo a partir de um prompt de texto. Modos suportados: text-to-video, image-to-video (image_base64 como primeiro frame), first+last frame (image_base64 + last_frame_base64), imagens de referência asset (até 3 imagens do mesmo sujeito) e style (1 imagem de estilo, apenas veo-2.0-generate-exp). Retorna um operationName para polling do status.' })
  @ApiResponse({ status: 201, description: 'Geração iniciada com sucesso', schema: { example: { operationName: 'projects/.../operations/uuid' } } })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generate(@Body() dto: GenerateVideoDto) {
    return this.videoService.generateVideo(dto);
  }

  @Post('status')
  @ApiOperation({ summary: 'Consultar status de geração', description: 'Consulta o status de uma operação de geração de vídeo. Use o operationName retornado pelo endpoint de geração.' })
  @ApiBody({ schema: { type: 'object', properties: { operationName: { type: 'string', description: 'Nome da operação retornado pelo endpoint de geração', example: 'projects/.../operations/uuid' } }, required: ['operationName'] } })
  @ApiResponse({ status: 201, description: 'Status da operação', schema: { example: { done: true, operationName: 'projects/.../operations/uuid', videos: [{ base64: '...', mimeType: 'video/mp4' }] } } })
  async getStatus(@Body('operationName') operationName: string) {
    return this.videoService.getVideoStatus(operationName);
  }
}
