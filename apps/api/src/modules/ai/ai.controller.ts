import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ChatResponse } from '@reservafacil/contracts';

import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

/**
 * Misma superficie pública que `PublicController` (`public/:slug`): sin auth,
 * el tenant sale del slug de la URL, no de un JWT.
 */
@ApiTags('ai')
@Controller('public/:slug/chat')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  @ApiOperation({ summary: 'Chat del asistente de reservas (function calling con Gemini)' })
  async chat(@Param('slug') slug: string, @Body() dto: ChatDto): Promise<ChatResponse> {
    return this.aiService.chat(slug, dto.message, dto.history);
  }
}
