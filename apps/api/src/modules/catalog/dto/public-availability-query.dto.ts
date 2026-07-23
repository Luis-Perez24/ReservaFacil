import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

import { DATE_PATTERN } from './create-availability-exception.dto';

export class PublicAvailabilityQueryDto {
  @ApiProperty({ description: 'id del servicio', format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  /** Día a consultar, en fecha local del negocio. */
  @ApiProperty({ description: 'Día a consultar, fecha local del negocio', example: '2026-07-27' })
  @Matches(DATE_PATTERN, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;
}
