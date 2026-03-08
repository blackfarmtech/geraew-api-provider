import { IsString, IsOptional, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({ description: 'Prompt de texto para gerar a imagem', example: 'A futuristic cityscape at sunset, cyberpunk style' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Quantidade de imagens a gerar', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  count?: number;

  @ApiPropertyOptional({ description: 'Modelo do Imagen', default: 'nano-banana-2' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Proporção da imagem', example: '16:9' })
  @IsOptional()
  @IsString()
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: 'Prompt negativo (o que evitar)', example: 'blurry, low quality' })
  @IsOptional()
  @IsString()
  negative_prompt?: string;

  @ApiPropertyOptional({ description: 'Idioma do prompt', example: 'pt' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Política de geração de pessoas', enum: ['dont_allow', 'allow_adult', 'allow_all'] })
  @IsOptional()
  @IsIn(['dont_allow', 'allow_adult', 'allow_all'])
  person_generation?: string;

  @ApiPropertyOptional({ description: 'Nível de filtragem de segurança', enum: ['block_low_and_above', 'block_medium_and_above', 'block_only_high', 'block_none'] })
  @IsOptional()
  @IsIn(['block_low_and_above', 'block_medium_and_above', 'block_only_high', 'block_none'])
  safety_setting?: string;

  @ApiPropertyOptional({ description: 'Tamanho da amostra de imagem', enum: ['1K', '2K'] })
  @IsOptional()
  @IsIn(['1K', '2K'])
  sample_image_size?: string;

  @ApiPropertyOptional({ description: 'Seed para reprodutibilidade', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seed?: number;

  @ApiPropertyOptional({ description: 'Melhorar o prompt automaticamente' })
  @IsOptional()
  @IsBoolean()
  enhance_prompt?: boolean;

  @ApiPropertyOptional({ description: 'Adicionar marca d\'água à imagem' })
  @IsOptional()
  @IsBoolean()
  add_watermark?: boolean;

  @ApiPropertyOptional({ description: 'MIME type da imagem de saída', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiPropertyOptional({ description: 'Região do Vertex AI', default: 'us-central1' })
  @IsOptional()
  @IsString()
  location?: string;
}
