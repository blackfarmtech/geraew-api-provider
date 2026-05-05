import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { VertexService } from '../vertex/vertex.service';
import { ChatRequestDto } from './dto/chat.dto';

const DEFAULT_LOCATION = 'global';
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly vertexService: VertexService) {}

  async chat(dto: ChatRequestDto, requestLogId?: string) {
    const model = dto.model || DEFAULT_MODEL;
    const location = DEFAULT_LOCATION;

    const contents = dto.messages.map((m) => ({
      role: m.role,
      parts: m.parts.map((p) => {
        if (p.inline_data) {
          return {
            inlineData: {
              mimeType: p.inline_data.mime_type,
              data: p.inline_data.base64,
            },
          };
        }
        return { text: p.text ?? '' };
      }),
    }));

    const generationConfig: Record<string, any> = {
      temperature: dto.temperature ?? 1,
      maxOutputTokens: dto.max_output_tokens ?? 65535,
      topP: 0.95,
    };

    if (dto.thinking_level) {
      generationConfig.thinkingConfig = { thinkingLevel: dto.thinking_level };
    }

    const body: Record<string, any> = {
      contents,
      generationConfig,
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
      ],
    };

    if (dto.system_instruction) {
      body.systemInstruction = {
        parts: [{ text: dto.system_instruction }],
      };
    }

    if (dto.google_search) {
      body.tools = [{ googleSearch: {} }];
    }

    const path =
      '/v1/projects/{PROJECT_ID}/locations/' +
      `${location}/publishers/google/models/${model}:streamGenerateContent`;

    const data = await this.vertexService.proxyRequest(
      'POST',
      path,
      body,
      location,
      false,
      requestLogId,
    );

    // streamGenerateContent retorna array de chunks
    const chunks = Array.isArray(data) ? data : [data];

    const textParts: string[] = [];
    let role = 'model';
    let finishReason: string | undefined;
    let usage: any;
    const groundingChunks: any[] = [];

    for (const chunk of chunks) {
      const cand = chunk?.candidates?.[0];
      if (!cand) continue;
      role = cand.content?.role || role;
      if (cand.finishReason) finishReason = cand.finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (cand.groundingMetadata?.groundingChunks) {
        groundingChunks.push(...cand.groundingMetadata.groundingChunks);
      }
      const parts = cand.content?.parts || [];
      for (const p of parts) {
        if (p.text) textParts.push(p.text);
      }
    }

    const text = textParts.join('');
    if (!text && !groundingChunks.length) {
      throw new BadRequestException(
        'Resposta vazia do modelo.' +
          (finishReason ? ` finishReason=${finishReason}` : ''),
      );
    }

    return { text, role, finishReason, usage, groundingChunks };
  }
}
