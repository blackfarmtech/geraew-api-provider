import { IsString, IsOptional, IsIn, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeminiInputImage {
  @ApiProperty({ description: 'Imagem em base64' })
  @IsString()
  base64: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem', default: 'image/png', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;
}

export class GenerateGeminiImageDto {
  @ApiProperty({ description: 'Prompt de texto para gerar/editar a imagem', example: 'Transform this photo into a watercolor painting' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Modelo Gemini a utilizar' })
  @IsOptional()
  @IsString()
  @IsIn(['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'])
  model?: string;

  @ApiPropertyOptional({ description: 'Proporção da imagem', enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] })
  @IsOptional()
  @IsIn(['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: 'Tamanho da imagem de saída' })
  @IsOptional()
  @IsString()
  image_size?: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem de saída', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiPropertyOptional({ description: 'Imagens de input para edição/referência', type: [GeminiInputImage] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiInputImage)
  images?: GeminiInputImage[];
}
