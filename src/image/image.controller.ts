import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { ImageService } from './image.service';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GenerateGeminiImageDto } from './dto/generate-gemini-image.dto';

@ApiTags('Image')
@ApiSecurity('x-api-key')
@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Gerar imagem (Imagen)', description: 'Gera imagens usando o modelo Imagen do Vertex AI. Retorna a resposta direta da API Vertex AI com as imagens geradas.' })
  @ApiResponse({ status: 201, description: 'Imagem gerada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generate(@Body() dto: GenerateImageDto) {
    return this.imageService.generateImage(dto);
  }

  @Post('generate-gemini')
  @ApiOperation({ summary: 'Gerar imagem (Gemini)', description: 'Gera ou edita imagens usando o modelo Gemini. Suporta envio de imagens de referência para edição. Retorna partes de texto e imagem.' })
  @ApiResponse({ status: 201, description: 'Imagem gerada com sucesso', schema: { example: { parts: [{ type: 'text', text: 'Here is your image' }, { type: 'image', base64: '...', mimeType: 'image/png' }] } } })
  @ApiResponse({ status: 400, description: 'Nenhum conteúdo gerado ou dados inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateGemini(@Body() dto: GenerateGeminiImageDto) {
    return this.imageService.generateGeminiImage(dto);
  }
}
