import { Injectable } from '@nestjs/common';
import { VertexService } from '../vertex/vertex.service';
import { GenerateVideoWithReferencesDto } from './dto/generate-video-with-references.dto';
import { GenerateVideoTextToVideoDto } from './dto/generate-video-text-to-video.dto';
import { GenerateVideoImageToVideoDto } from './dto/generate-video-image-to-video.dto';



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

  async getVideoStatus(operationName: string, requestLogId?: string) {
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
