import { Injectable } from '@nestjs/common';
import { VertexService } from '../vertex/vertex.service';
import { GenerateVideoDto } from './dto/generate-video.dto';


const DEFAULT_LOCATION = 'us-central1';

@Injectable()
export class VideoService {
  constructor(private readonly vertexService: VertexService) { }

  async generateVideo(dto: GenerateVideoDto) {
    const model = dto.model
    const location = dto.location || DEFAULT_LOCATION;

    const instance: Record<string, any> = { prompt: dto.prompt };

    if (dto.image_base64) {
      instance.image = {
        bytesBase64Encoded: dto.image_base64,
        mimeType: dto.image_mime_type || 'image/jpeg',
      };
    }

    if (dto.last_frame_base64) {
      instance.lastFrame = {
        bytesBase64Encoded: dto.last_frame_base64,
        mimeType: dto.last_frame_mime_type || 'image/jpeg',
      };
    }

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
      aspectRatio: dto.aspect_ratio || '16:9',
      durationSeconds: dto.duration_seconds ?? 8,
      sampleCount: dto.sample_count ?? 1,
      resolution: dto.resolution || '720p',
      generateAudio: dto.generate_audio ?? true,
      personGeneration: dto.person_generation || 'allow_adult',
    };

    if (dto.negative_prompt) {
      parameters.negativePrompt = dto.negative_prompt;
    }
    if (dto.seed !== undefined) {
      parameters.seed = dto.seed;
    }
    if (dto.storage_uri) {
      parameters.storageUri = dto.storage_uri;
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
    );

    return { operationName: data.name };
  }

  async getVideoStatus(operationName: string) {
    // Extrai location e model do operationName:
    // "projects/.../locations/us-central1/publishers/google/models/MODEL_ID/operations/UUID"
    const locationMatch = operationName.match(/locations\/([^/]+)\//);
    const location = locationMatch ? locationMatch[1] : 'us-central1';

    const modelMatch = operationName.match(/models\/([^/]+)\//);
    const model = modelMatch ? modelMatch[1] : 'veo-3.1-generate-preview';

    const path =
      `/v1/projects/{PROJECT_ID}/locations/${location}` +
      `/publishers/google/models/${model}:fetchPredictOperation`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      { operationName },
      location,
      true,
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
