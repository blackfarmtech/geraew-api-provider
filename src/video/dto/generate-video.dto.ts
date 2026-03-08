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

export class GenerateVideoDto {
  @ApiProperty({ description: 'Prompt de texto para gerar o vídeo', example: 'A cinematic aerial shot of a coastal city at sunset' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Modelo do Vertex AI', default: 'veo-3.1-generate-preview', example: 'veo-3.1-generate-preview' })
  @IsOptional()
  @IsString()
  @IsIn(['veo-3.1-generate-preview', 'eo-3.1-fast-generate-preview'])
  model?: string;

  @ApiPropertyOptional({ description: 'Região do Vertex AI', default: 'us-central1', example: 'us-central1' })
  @IsOptional()
  @IsString()
  location?: string;

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

  @ApiPropertyOptional({ description: 'Resolução do vídeo', enum: ['720p', '1080p'], default: '720p' })
  @IsOptional()
  @IsString()
  @IsIn(['720p', '1080p'])
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

  @ApiPropertyOptional({ description: 'Política de geração de pessoas', enum: ['allow_adult', 'dont_allow', 'allow_all'], default: 'allow_adult' })
  @IsOptional()
  @IsString()
  @IsIn(['allow_adult', 'dont_allow', 'allow_all'])
  person_generation?: string;

  @ApiPropertyOptional({ description: 'Seed para reprodutibilidade', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seed?: number;

  @ApiPropertyOptional({ description: 'URI do GCS para armazenar o resultado' })
  @IsOptional()
  @IsString()
  storage_uri?: string;

  @ApiPropertyOptional({ description: 'Imagem de input em base64 (para image-to-video)' })
  @IsOptional()
  @IsString()
  image_base64?: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem de input', default: 'image/jpeg', example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  image_mime_type?: string;

  @ApiPropertyOptional({ description: 'Último frame em base64 (para controle de final do vídeo)' })
  @IsOptional()
  @IsString()
  last_frame_base64?: string;

  @ApiPropertyOptional({ description: 'MIME type do último frame', default: 'image/jpeg' })
  @IsOptional()
  @IsString()
  last_frame_mime_type?: string;

  @ApiPropertyOptional({
    description: 'Imagens de referência (asset: até 3 imagens do mesmo sujeito, style: 1 imagem de estilo). Style só funciona com veo-2.0-generate-exp.',
    type: [ReferenceImageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImageDto)
  reference_images?: ReferenceImageDto[];
}
