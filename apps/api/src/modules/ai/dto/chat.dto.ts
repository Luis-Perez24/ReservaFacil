import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatMessage, ChatRequest } from '@reservafacil/contracts';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ChatMessageDto implements ChatMessage {
  @ApiProperty({ enum: ['user', 'model'] })
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text!: string;
}

export class ChatDto implements ChatRequest {
  @ApiProperty({ description: 'Mensaje del cliente', example: 'quiero corte el sábado en la tarde' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ type: [ChatMessageDto], description: 'Turnos previos de la conversación' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
