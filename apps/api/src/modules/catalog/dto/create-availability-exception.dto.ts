import type { CreateAvailabilityExceptionRequest } from '@reservafacil/contracts';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

import { TIME_PATTERN } from './create-availability-rule.dto';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAvailabilityExceptionDto implements CreateAvailabilityExceptionRequest {
  /** Fecha local del negocio. Que sea una fecha real se valida en el servicio. */
  @Matches(DATE_PATTERN, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;

  @IsBoolean()
  closed!: boolean;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime debe ser HH:mm (24h)' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime debe ser HH:mm (24h)' })
  endTime?: string;
}
