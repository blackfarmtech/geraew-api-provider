import {
    IsString,
    IsOptional,
    IsIn,
    IsArray,
    ArrayMaxSize,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export class OmniImageDto {
    @ApiProperty({ description: 'Imagem de referência em base64' })
    @IsString()
    base64: string;

    @ApiPropertyOptional({ description: 'Mime type da imagem', default: 'image/png' })
    @IsOptional()
    @IsString()
    mime_type?: string;
}


export class GenerateVideoOmniDto {
    @ApiProperty({ description: 'Prompt de texto para gerar ou editar o vídeo', example: 'A futuristic city with neon lights and flying cars, cyberpunk style' })
    @IsString()
    prompt: string;

    @ApiPropertyOptional({ description: 'Modelo do Vertex AI (Interactions API)', default: 'gemini-omni-flash-preview', example: 'gemini-omni-flash-preview' })
    @IsOptional()
    @IsString()
    @IsIn(['gemini-omni-flash-preview'])
    model?: string;

    @ApiPropertyOptional({ description: 'Proporção do vídeo', enum: ['16:9', '9:16'], default: '16:9' })
    @IsOptional()
    @IsString()
    @IsIn(['16:9', '9:16'])
    aspect_ratio?: string;

    @ApiPropertyOptional({ description: 'Entrega do vídeo: "base64" (inline, só até ~4MB) ou "uri" (link para download, recomendado para vídeos maiores)', enum: ['base64', 'uri'], default: 'uri' })
    @IsOptional()
    @IsString()
    @IsIn(['base64', 'uri'])
    delivery?: string;

    @ApiPropertyOptional({ description: 'Bucket GCS onde gravar o vídeo quando delivery="uri" (ex.: gs://meu-bucket/videos). Se omitido, usa a env BUCKET_S3.', example: 'gs://meu-bucket/videos' })
    @IsOptional()
    @IsString()
    gcs_uri?: string;

    @ApiPropertyOptional({ description: 'Imagem de referência em base64 (ativa image_to_video ou reference_to_video)' })
    @IsOptional()
    @IsString()
    first_frame?: string;

    @ApiPropertyOptional({ description: 'Mime type da imagem de referência', default: 'image/png' })
    @IsOptional()
    @IsString()
    first_frame_mime_type?: string;

    @ApiPropertyOptional({ description: 'Várias imagens de referência (cada uma vira um content item). 1 imagem → image_to_video; 2+ → reference_to_video. Tem precedência sobre first_frame.', type: [OmniImageDto] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(7)
    @ValidateNested({ each: true })
    @Type(() => OmniImageDto)
    images?: OmniImageDto[];

    @ApiPropertyOptional({ description: 'Vídeo em base64 para edição direta (ativa a task edit)' })
    @IsOptional()
    @IsString()
    video_base64?: string;

    @ApiPropertyOptional({ description: 'Mime type do vídeo de entrada', default: 'video/mp4' })
    @IsOptional()
    @IsString()
    video_mime_type?: string;

    @ApiPropertyOptional({ description: 'Sobrescreve a task inferida. text_to_video (só prompt), image_to_video / reference_to_video (com imagem), edit (com vídeo ou previous_interaction_id)', enum: ['text_to_video', 'image_to_video', 'reference_to_video', 'edit'] })
    @IsOptional()
    @IsString()
    @IsIn(['text_to_video', 'image_to_video', 'reference_to_video', 'edit'])
    task?: string;

    @ApiPropertyOptional({ description: 'ID de uma interação anterior para edição conversacional do vídeo gerado', example: 'v1_abc123' })
    @IsOptional()
    @IsString()
    previous_interaction_id?: string;
}
