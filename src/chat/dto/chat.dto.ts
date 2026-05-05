import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsNumber,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatInlineData {
  @ApiProperty({ description: 'Conteúdo em base64 (sem prefixo data:)' })
  @IsString()
  base64: string;

  @ApiProperty({ description: 'MIME type', example: 'image/png' })
  @IsString()
  mime_type: string;
}

export class ChatPart {
  @ApiPropertyOptional({ description: 'Texto da parte' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    description: 'Mídia inline (imagem, vídeo, áudio, PDF...)',
    type: ChatInlineData,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatInlineData)
  inline_data?: ChatInlineData;
}

export class ChatMessage {
  @ApiProperty({ enum: ['user', 'model'], example: 'user' })
  @IsIn(['user', 'model'])
  role: 'user' | 'model';

  @ApiProperty({ type: [ChatPart] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatPart)
  parts: ChatPart[];
}

export class ChatRequestDto {
  @ApiProperty({ type: [ChatMessage], description: 'Histórico completo da conversa' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessage)
  messages: ChatMessage[];

  @ApiPropertyOptional({ description: 'Modelo Gemini', default: 'gemini-3-pro-preview' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'System instruction (opcional)' })
  @IsOptional()
  @IsString()
  system_instruction?: string;

  @ApiPropertyOptional({ description: 'Temperature 0..2', default: 1 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Max output tokens', default: 65535 })
  @IsOptional()
  @IsNumber()
  max_output_tokens?: number;

  @ApiPropertyOptional({ description: 'Thinking level', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  thinking_level?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({ description: 'Habilita Google Search grounding' })
  @IsOptional()
  google_search?: boolean;
}
