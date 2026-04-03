import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReferenceImageDto {
  @ApiProperty({ description: 'Imagem em base64' })
  @IsString()
  base64: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem', enum: ['image/jpeg', 'image/png'], default: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @IsIn(['image/jpeg', 'image/png'])
  mime_type?: string;

  @ApiProperty({ description: 'Tipo de referência', enum: ['asset', 'style'] })
  @IsString()
  @IsIn(['asset', 'style'])
  reference_type: 'asset' | 'style';
}

export class GenerateVideoWithReferencesDto {
  @ApiProperty({ description: 'Prompt de texto para gerar o vídeo', example: 'A cinematic aerial shot of a coastal city at sunset' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Modelo do Vertex AI', default: 'veo-3.1-generate-001', example: 'veo-3.1-generate-001' })
  @IsOptional()
  @IsString()
  @IsIn(['veo-3.1-generate-001', 'veo-3.1-fast-generate-001'])
  model?: string;

  @ApiPropertyOptional({ description: 'Duração do vídeo em segundos', default: 8, example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  duration_seconds?: number;

  @ApiPropertyOptional({ description: 'Proporção do vídeo', enum: ['16:9', '9:16'], default: '16:9' })
  @IsOptional()
  @IsString()
  @IsIn(['16:9', '9:16'])
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: 'Resolução do vídeo', enum: ['720p', '1080p', '4K'], default: '720p' })
  @IsOptional()
  @IsString()
  @IsIn(['720p', '1080p', '4K'])
  resolution?: string;

  @ApiPropertyOptional({ description: 'Gerar áudio junto com o vídeo', default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  generate_audio?: boolean;

  @ApiPropertyOptional({ description: 'Quantidade de amostras a gerar', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sample_count?: number;

  @ApiPropertyOptional({ description: 'Prompt negativo (o que evitar)', example: 'blurry, low quality' })
  @IsOptional()
  @IsString()
  negative_prompt?: string;

  @ApiPropertyOptional({
    description: 'Imagens de referência (asset: até 3 imagens do mesmo sujeito, style: 1 imagem de estilo). Style só funciona com veo-2.0-generate-001.',
    type: [ReferenceImageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImageDto)
  reference_images?: ReferenceImageDto[];
}
