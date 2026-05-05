import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { Request } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('Chat')
@ApiSecurity('x-api-key')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({
    summary: 'Conversar com Gemini (multimodal)',
    description:
      'Envia o histórico completo da conversa (texto + imagens + vídeo + áudio + PDF) e recebe a resposta do modelo.',
  })
  @ApiResponse({ status: 201, description: 'Resposta gerada com sucesso' })
  @ApiResponse({ status: 400, description: 'Resposta vazia ou dados inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async chat(@Body() dto: ChatRequestDto, @Req() req: Request) {
    return this.chatService.chat(dto, req['requestLogId']);
  }
}
