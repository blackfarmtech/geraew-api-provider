import { Injectable } from '@nestjs/common';
import { VertexService } from '../vertex/vertex.service';
import { GenerateVideoWithReferencesDto } from './dto/generate-video-with-references.dto';
import { GenerateVideoTextToVideoDto } from './dto/generate-video-text-to-video.dto';
import { GenerateVideoImageToVideoDto } from './dto/generate-video-image-to-video.dto';
import { GenerateVideoOmniDto } from './dto/generate-video-omni.dto';

const OMNI_DEFAULT_MODEL = 'gemini-omni-flash-preview';
const OMNI_API_REVISION = '2026-05-20';
const OMNI_OPERATION_PREFIX = 'interactions/';

@Injectable()
export class VideoService {
  constructor(private readonly vertexService: VertexService) { }

  async generateVideoTextToVideo(dto: GenerateVideoTextToVideoDto, requestLogId?: string) {
    const model = dto.model
    const location = process.env.LOCATION

    const instance: Record<string, any> = { prompt: dto.prompt };

    const parameters: Record<string, any> = {
      aspectRatio: dto.aspect_ratio,
      durationSeconds: dto.duration_seconds,
      sampleCount: dto.sample_count,
      resolution: dto.resolution,
      generateAudio: dto.generate_audio,
      storageUri: process.env.BUCKET_S3,
      personGeneration: 'allow_all',
    };

    if (dto.negative_prompt) {
      parameters.negativePrompt = dto.negative_prompt;
    }


    const body = {
      instances: [instance],
      parameters,
    };

    const path =
      `/v1/projects/{PROJECT_ID}/locations/${location}` +
      `/publishers/google/models/${model}:predictLongRunning`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      location,
      true,
      requestLogId,
    );

    return { operationName: data.name };
  }

  async generateVideoImageToVideo(dto: GenerateVideoImageToVideoDto, requestLogId?: string) {
    const model = dto.model
    const location = process.env.LOCATION

    const instance: Record<string, any> = { prompt: dto.prompt };


    instance.image = {
      bytesBase64Encoded: dto.first_frame,
      mimeType: "image/png",
    };


    if (dto.last_frame) {
      instance.lastFrame = {
        bytesBase64Encoded: dto.last_frame,
        mimeType: "image/png"
      };
    }



    const parameters: Record<string, any> = {
      aspectRatio: dto.aspect_ratio,
      durationSeconds: dto.duration_seconds,
      sampleCount: dto.sample_count,
      resolution: dto.resolution,
      generateAudio: dto.generate_audio ?? true,
      storageUri: process.env.BUCKET_S3,
      personGeneration: 'allow_all',
    };

    if (dto.negative_prompt) {
      parameters.negativePrompt = dto.negative_prompt;
    }

    const body = {
      instances: [instance],
      parameters,
    };

    const path =
      `/v1/projects/{PROJECT_ID}/locations/${location}` +
      `/publishers/google/models/${model}:predictLongRunning`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      location,
      true,
      requestLogId,
    );

    return { operationName: data.name };
  }

  async generateVideoWithRefereces(dto: GenerateVideoWithReferencesDto, requestLogId?: string) {
    const model = dto.model
    const location = process.env.LOCATION

    const instance: Record<string, any> = { prompt: dto.prompt };


    if (dto.reference_images?.length) {
      instance.referenceImages = dto.reference_images.map((ref) => ({
        image: {
          bytesBase64Encoded: ref.base64,
          mimeType: ref.mime_type || 'image/jpeg',
        },
        referenceType: ref.reference_type,
      }));
    }




    const parameters: Record<string, any> = {
      aspectRatio: dto.aspect_ratio,
      durationSeconds: dto.duration_seconds,
      sampleCount: dto.sample_count,
      resolution: dto.resolution,
      generateAudio: dto.generate_audio ?? true,
      storageUri: process.env.BUCKET_S3,
      personGeneration: 'allow_all',
    };

    if (dto.negative_prompt) {
      parameters.negativePrompt = dto.negative_prompt;
    }


    const body = {
      instances: [instance],
      parameters,
    };

    const path =
      `/v1/projects/{PROJECT_ID}/locations/${location}` +
      `/publishers/google/models/${model}:predictLongRunning`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      location,
      true,
      requestLogId,
    );

    return { operationName: data.name };
  }

  async generateVideoOmni(dto: GenerateVideoOmniDto, requestLogId?: string) {
    const model = dto.model || OMNI_DEFAULT_MODEL;

    // Normaliza as imagens: o array `images` tem precedência sobre first_frame.
    const images =
      dto.images?.length
        ? dto.images.map((img) => ({
            data: img.base64,
            mime_type: img.mime_type || 'image/png',
          }))
        : dto.first_frame
          ? [
              {
                data: dto.first_frame,
                mime_type: dto.first_frame_mime_type || 'image/png',
              },
            ]
          : [];

    // A ordem segue os exemplos da doc: mídia primeiro, texto por último.
    // Cada imagem vira um content item separado.
    const content: Record<string, any>[] = [];

    if (dto.video_base64) {
      content.push({
        type: 'video',
        data: dto.video_base64,
        mime_type: dto.video_mime_type || 'video/mp4',
      });
    }

    for (const img of images) {
      content.push({ type: 'image', data: img.data, mime_type: img.mime_type });
    }

    content.push({ type: 'text', text: dto.prompt });

    // 2+ imagens → reference_to_video; 1 imagem → image_to_video (conforme a doc).
    const task =
      dto.task ||
      (dto.video_base64 || dto.previous_interaction_id
        ? 'edit'
        : images.length > 1
          ? 'reference_to_video'
          : images.length === 1
            ? 'image_to_video'
            : 'text_to_video');

    const delivery = dto.delivery || 'uri';

    const responseFormat: Record<string, any> = {
      type: 'video',
      aspect_ratio: dto.aspect_ratio || '16:9',
      delivery,
    };

    // A entrega por URI exige um bucket GCS onde o vídeo será gravado.
    if (delivery === 'uri') {
      const gcsUri = dto.gcs_uri || process.env.BUCKET_S3;
      if (!gcsUri) {
        throw new Error(
          "delivery 'uri' requires a gcs_uri (set dto.gcs_uri or the BUCKET_S3 env var)",
        );
      }
      responseFormat.gcs_uri = gcsUri;
    }

    const body: Record<string, any> = {
      model,
      input: [{ type: 'user_input', content }],
      response_format: responseFormat,
      generation_config: {
        video_config: { task },
      },
    };

    if (dto.previous_interaction_id) {
      body.previous_interaction_id = dto.previous_interaction_id;
    }

    const path = '/v1beta1/projects/{PROJECT_ID}/locations/global/interactions';

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      'global',
      false,
      requestLogId,
      { 'Api-Revision': OMNI_API_REVISION },
    );

    const interactionId =
      data.interaction_id ||
      data.id ||
      (typeof data.name === 'string' ? data.name.split('/').pop() : undefined);

    const videos = this.extractOmniVideos(data);

    return {
      operationName: `${OMNI_OPERATION_PREFIX}${interactionId}`,
      interactionId,
      ...(data.status && { status: data.status }),
      ...(videos.length && { done: true, videos }),
    };
  }

  private async getOmniInteractionStatus(interactionId: string, requestLogId?: string) {
    const path =
      `/v1beta1/projects/{PROJECT_ID}/locations/global/interactions/${interactionId}`;

    const data = await this.vertexService.proxyRequest(
      'GET',
      path,
      null,
      'global',
      false,
      requestLogId,
      { 'Api-Revision': OMNI_API_REVISION },
    );

    const operationName = `${OMNI_OPERATION_PREFIX}${interactionId}`;
    const videos = this.extractOmniVideos(data);

    if (videos.length) {
      return { done: true, operationName, videos };
    }

    const status = String(data.status || '').toLowerCase();
    const pending = ['in_progress', 'queued', 'processing', 'running', 'pending', 'created'];
    if (!status || pending.includes(status)) {
      return { done: false, operationName };
    }

    return {
      done: true,
      operationName,
      ...(data.error && { error: data.error }),
    };
  }

  // A Interactions API retorna o vídeo dentro do array de steps, em posição que
  // varia por revisão da API — varre a resposta atrás de content items de vídeo.
  private extractOmniVideos(data: any) {
    const videos: { base64?: string; gcsUri?: string; mimeType: string }[] = [];

    const visit = (node: any) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!node || typeof node !== 'object') return;

      const mime = node.mime_type || node.mimeType;
      const isVideo =
        node.type === 'video' ||
        (typeof mime === 'string' && mime.startsWith('video/'));

      if (isVideo && (node.data || node.uri)) {
        videos.push({
          ...(node.data && { base64: node.data }),
          ...(node.uri && { gcsUri: node.uri }),
          mimeType: mime || 'video/mp4',
        });
        return;
      }

      Object.values(node).forEach(visit);
    };

    visit(data);
    return videos;
  }

  async getVideoStatus(operationName: string, requestLogId?: string) {
    if (operationName.startsWith(OMNI_OPERATION_PREFIX)) {
      return this.getOmniInteractionStatus(
        operationName.slice(OMNI_OPERATION_PREFIX.length),
        requestLogId,
      );
    }

    // Extrai location e model do operationName:
    // "projects/.../locations/us-central1/publishers/google/models/MODEL_ID/operations/UUID"
    const locationMatch = operationName.match(/locations\/([^/]+)\//);
    const location = locationMatch ? locationMatch[1] : 'us-central1';

    const modelMatch = operationName.match(/models\/([^/]+)\//);
    const model = modelMatch ? modelMatch[1] : 'veo-3.1-generate-001';

    const path =
      `/v1/projects/{PROJECT_ID}/locations/${location}` +
      `/publishers/google/models/${model}:fetchPredictOperation`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      { operationName },
      location,
      true,
      requestLogId,
    );

    const done = data.done === true;

    if (!done) {
      return { done: false, operationName: data.name };
    }

    if (data.response?.videos) {
      const videos = data.response.videos.map((v: any) => ({
        ...(v.bytesBase64Encoded && { base64: v.bytesBase64Encoded }),
        ...(v.gcsUri && { gcsUri: v.gcsUri }),
        mimeType: v.mimeType,
      }));
      return { done: true, operationName: data.name, videos };
    }

    return {
      done: true,
      operationName: data.name,
      ...(data.error && { error: data.error }),
    };
  }
}
