import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateAvailabilityExceptionRequest } from '@reservafacil/contracts';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

import { TIME_PATTERN } from './create-availability-rule.dto';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAvailabilityExceptionDto implements CreateAvailabilityExceptionRequest {
  /** Fecha local del negocio. Que sea una fecha real se valida en el servicio. */
  @ApiProperty({ description: 'Fecha local del negocio', example: '2026-07-27', format: 'date' })
  @Matches(DATE_PATTERN, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: 'Si el negocio está cerrado en esta fecha', example: true })
  @IsBoolean()
  closed!: boolean;

  @ApiPropertyOptional({ description: 'Hora de inicio del cierre (si es cerrado parcial)', example: '09:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime debe ser HH:mm (24h)' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'Hora de término del cierre (si es cerrado parcial)', example: '17:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime debe ser HH:mm (24h)' })
  endTime?: string;
}
