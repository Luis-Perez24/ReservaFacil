import { IsUUID, Matches } from 'class-validator';

import { DATE_PATTERN } from './create-availability-exception.dto';

export class PublicAvailabilityQueryDto {
  @IsUUID()
  serviceId!: string;

  /** Día a consultar, en fecha local del negocio. */
  @Matches(DATE_PATTERN, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;
}
