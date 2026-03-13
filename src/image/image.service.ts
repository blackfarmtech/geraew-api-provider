import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { VertexService } from '../vertex/vertex.service';

const DEFAULT_LOCATION = 'global';



@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private readonly vertexService: VertexService,
    private readonly configService: ConfigService,
  ) { }

  async generateImage(dto: {
    prompt: string;
    count?: number;
    model?: string;
    aspect_ratio?: string;
    negative_prompt?: string;
    language?: string;
    person_generation?: string;
    safety_setting?: string;
    sample_image_size?: string;
    seed?: number;
    enhance_prompt?: boolean;
    add_watermark?: boolean;
    mime_type?: string;
    location?: string;
  }) {
    const location = dto.location || DEFAULT_LOCATION;
    const model = dto.model

    const parameters: Record<string, any> = {
      sampleCount: dto.count || 1,
    };

    if (dto.aspect_ratio) parameters.aspectRatio = dto.aspect_ratio;
    if (dto.negative_prompt) parameters.negativePrompt = dto.negative_prompt;
    if (dto.language) parameters.language = dto.language;
    if (dto.person_generation) parameters.personGeneration = dto.person_generation;
    if (dto.safety_setting) parameters.safetySetting = dto.safety_setting;
    if (dto.sample_image_size) parameters.sampleImageSize = dto.sample_image_size;
    if (dto.seed !== undefined) parameters.seed = dto.seed;
    if (dto.enhance_prompt !== undefined) parameters.enhancePrompt = dto.enhance_prompt;
    if (dto.add_watermark !== undefined) parameters.addWatermark = dto.add_watermark;
    if (dto.mime_type) {
      parameters.outputOptions = { mimeType: dto.mime_type };
    }

    const body = {
      instances: [{ prompt: dto.prompt }],
      parameters,
    };

    const path =
      '/v1/projects/{PROJECT_ID}/locations/' +
      `${location}/publishers/google/models/${model}:predict`;

    return this.vertexService.proxyRequest('POST', path, body, location);
  }

  async generateGeminiImage(dto: {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    image_size?: string;
    mime_type?: string;
    person_generation?: string;
    images?: Array<{ base64: string; mime_type?: string }>;
  }) {
    const location = DEFAULT_LOCATION;
    const model = dto.model

    const imageConfig: Record<string, any> = {};
    if (dto.aspect_ratio) imageConfig.aspectRatio = dto.aspect_ratio;
    if (dto.image_size) imageConfig.imageSize = dto.image_size;
    if (dto.mime_type) {
      imageConfig.imageOutputOptions = { mimeType: dto.mime_type };
    }

    imageConfig.personGeneration = dto.person_generation || 'ALLOW_ALL';

    const generationConfig: Record<string, any> = {
      temperature: 1,
      maxOutputTokens: 32768,
      topP: 0.95,
      responseModalities: ['IMAGE'],
      imageConfig,
    };

    const safetySettings = [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
    ];

    const userParts: any[] = [];
    if (dto.images?.length) {
      for (const img of dto.images) {
        userParts.push({
          inlineData: {
            mimeType: img.mime_type || 'image/png',
            data: img.base64,
          },
        });
      }
    }
    userParts.push({ text: dto.prompt });

    const body: Record<string, any> = {
      contents: [
        {
          role: 'user',
          parts: userParts,
        },
      ],
      generationConfig,
      safetySettings,
    };

    // if (dto.system_instruction) {
    //   body.systemInstruction = {
    //     parts: [{ text: dto.system_instruction }],
    //   };
    // }

    const path =
      '/v1/projects/{PROJECT_ID}/locations/' +
      `${location}/publishers/google/models/${model}:streamGenerateContent`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      location,
    );
    console.log(data);
    // streamGenerateContent returns an array of chunks
    const chunks = Array.isArray(data) ? data : [data];
    const candidate = chunks[0]?.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new BadRequestException(
        'No content generated. Try a different prompt.',
      );
    }

    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; base64: string; mimeType: string }
    > = [];

    for (const chunk of chunks) {
      const cand = chunk?.candidates?.[0];
      if (!cand?.content?.parts) continue;
      for (const part of cand.content.parts) {
        if (part.text) {
          parts.push({ type: 'text', text: part.text });
        }
        if (part.inlineData) {
          parts.push({
            type: 'image',
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          });
        }
      }
    }

    return { parts };
  }
}
